// GDPR webhook: shop/redact
//
// Shopify lo dispara 48h despues de que el merchant desinstale la app. Es la
// peticion de borrado TOTAL de los datos de esa tienda. Tenemos 30 dias por
// ley para borrar todo. Nosotros lo hacemos al recibirlo.
//
// Borramos:
//   - Agente ElevenLabs asociado
//   - Documentos KB en ElevenLabs
//   - Leads, transcripciones, conversation_logs, knowledge_documents
//   - Row de clients
//   - Row de shopify_installs
//
// Toda la operacion la hace la edge function shopify_purge. Este handler
// solo verifica HMAC y delega.

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`[seyben] GDPR ${topic} for ${shop}`);

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SHOPIFY_INSTALL_SECRET = process.env.SHOPIFY_INSTALL_SECRET;
  if (!SUPABASE_URL || !SHOPIFY_INSTALL_SECRET) {
    console.error(`[seyben] shop/redact for ${shop}: missing env vars`);
    return new Response();
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/shopify_purge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-shopify-install-secret": SHOPIFY_INSTALL_SECRET,
      },
      body: JSON.stringify({ shop_domain: shop }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[seyben] shopify_purge failed ${res.status}: ${text.slice(0, 300)}`);
    } else {
      const data = await res.json().catch(() => ({}));
      console.log(`[seyben] purged ${shop}:`, JSON.stringify(data).slice(0, 500));
    }
  } catch (err) {
    console.error(`[seyben] shopify_purge error:`, err);
  }

  return new Response();
};
