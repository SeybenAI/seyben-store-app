// Webhook consolidado para todos los topics que afectan al knowledge del agente:
//   products/create|update|delete, collections/*, shop/update.
//
// Estrategia:
//   1. Autenticar webhook (Shopify HMAC) -> {topic, shop, admin, payload}
//   2. Releer el catalogo entero desde Admin GraphQL (helper compartido)
//   3. POST a la edge function shopify_sync_knowledge con el nuevo payload
//
// La edge function reemplaza el doc de ElevenLabs y reapunta el agente.
// El merchant ve el cambio reflejado en el chat de su tienda en segundos.
//
// Idempotencia: Shopify reintenta webhooks si fallan. Si el sync ya esta
// en curso para esta tienda, el resync subsiguiente sobreescribe sin problema
// (uploadKB crea un nuevo doc, patchAgent apunta al nuevo, los anteriores se
// borran async).

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { fetchShopifyKnowledge } from "../lib/shopify-knowledge.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin } = await authenticate.webhook(request);
  console.log(`[seyben] webhook ${topic} from ${shop}`);

  // El webhook puede llegar despues de que el merchant haya desinstalado.
  // En ese caso no hay session ni admin: ignorar silenciosamente.
  if (!session || !admin) {
    console.warn(`[seyben] webhook ${topic} for ${shop}: no session, skipping`);
    return new Response();
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SHOPIFY_INSTALL_SECRET = process.env.SHOPIFY_INSTALL_SECRET;
  if (!SUPABASE_URL || !SHOPIFY_INSTALL_SECRET) {
    console.error("[seyben] webhook sync: missing env vars");
    return new Response("Server config missing", { status: 500 });
  }

  try {
    // 1. Releer catalogo entero desde Admin API. Es el unico modo de tener
    //    una vision consistente (Shopify no manda diffs en los webhooks).
    const knowledgePayload = await fetchShopifyKnowledge(admin);

    // 2. Mandar a la edge function. Hacemos esto en background-ish: la
    //    respuesta al webhook se devuelve cuando Supabase termina el upload.
    //    Si tarda mas de 5s, Shopify nos da 503 pero ya hemos delegado el
    //    trabajo. La edge function termina igual.
    const res = await fetch(`${SUPABASE_URL}/functions/v1/shopify_sync_knowledge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-shopify-install-secret": SHOPIFY_INSTALL_SECRET,
      },
      body: JSON.stringify({
        shop_domain: shop,
        trigger: topic,
        knowledge_payload: knowledgePayload,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[seyben] sync edge function failed (${res.status}): ${errText.slice(0, 300)}`);
      // Devolvemos 200 igualmente: si fue un fallo transitorio no queremos que
      // Shopify reintente en bucle sumando trabajo. Logueamos para Sentry/Supabase.
    } else {
      const data = await res.json().catch(() => ({}));
      console.log(`[seyben] synced ${shop} (${topic}): ${JSON.stringify(data)}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[seyben] webhook sync ${topic} for ${shop} failed:`, msg);
    // Tambien 200 para evitar reintentos en cascada.
  }

  return new Response();
};
