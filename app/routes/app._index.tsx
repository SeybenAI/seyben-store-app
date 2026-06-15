import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { fetchShopifyKnowledge } from "../lib/shopify-knowledge.server";

// Helper: extrae el value del CustomEvent que disparan los web components de Polaris.
function readValue(setter: (v: string) => void) {
  return (e: Event) => {
    const target = e.currentTarget as HTMLInputElement | HTMLSelectElement | null;
    setter(target?.value ?? "");
  };
}

// ============================================================================
// LOADER — Solo info ligera para el wizard (conteos, nombre, contacto)
// ============================================================================
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(`#graphql
    query SeybenShopSummary {
      shop {
        id
        name
        myshopifyDomain
        contactEmail
        primaryDomain { url host }
      }
      productsCount { count }
    }
  `);
  const data = (await response.json()).data;

  // El catalogo completo NO se baja aqui; se baja al pulsar Crear (action) para
  // no penalizar el primer render. Mostramos solo el conteo y los datos de tienda.
  return {
    shop: data.shop,
    productsCount: data.productsCount?.count ?? 0,
    shopDomain: session.shop,
  };
};

// ============================================================================
// ACTION — Construye knowledge desde Admin GraphQL y crea el agente
// ============================================================================
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SHOPIFY_INSTALL_SECRET = process.env.SHOPIFY_INSTALL_SECRET;
  if (!SUPABASE_URL || !SHOPIFY_INSTALL_SECRET) {
    return {
      ok: false,
      message: "Falta configuracion en el servidor (SUPABASE_URL o SHOPIFY_INSTALL_SECRET).",
    };
  }

  // 1. Bajar todo el catalogo + paginas + politicas + colecciones via Admin API.
  //    Esto NO scrapea: lee de la BBDD de Shopify por GraphQL. Sin esto, el
  //    agente no tendria conocimiento de los productos.
  let knowledgePayload;
  try {
    knowledgePayload = await fetchShopifyKnowledge(admin);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[seyben] fetchShopifyKnowledge failed", msg);
    return {
      ok: false,
      message: `No pudimos leer tu tienda desde Shopify: ${msg}`,
    };
  }

  const payload = {
    shop_domain: session.shop,
    name: String(formData.get("name") || "Asistente"),
    language: String(formData.get("language") || "Espanol"),
    tone: String(formData.get("tone") || "Cercano e informal"),
    widget_color: String(formData.get("color") || "#7c3aed"),
    widget_action_text: String(formData.get("actionText") || "Habla con nosotros"),
    widget_position: String(formData.get("position") || "bottom-right"),
    plan_tier: String(formData.get("plan") || "free"),
    owner_name: String(formData.get("ownerName") || ""),
    owner_email: String(formData.get("ownerEmail") || ""),
    access_token: session.accessToken ?? null,
    scope: session.scope ?? null,
    knowledge_payload: knowledgePayload,
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/shopify_install`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-shopify-install-secret": SHOPIFY_INSTALL_SECRET,
      },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || !data.ok) {
      console.error("[seyben] shopify_install failed", res.status, data);
      return {
        ok: false,
        message: `No se pudo crear el agente (HTTP ${res.status}). ${String(data.error ?? "")}`,
        detail: data,
      };
    }
    return {
      ok: true,
      already_exists: Boolean(data.already_exists),
      lead_id: String(data.lead_id ?? ""),
      elevenlabs_agent_id: String(data.elevenlabs_agent_id ?? ""),
      knowledge_chars: Number(data.knowledge_chars ?? 0),
      products_count: Number(data.products_count ?? 0),
      pages_count: Number(data.pages_count ?? 0),
      message: data.already_exists
        ? "Ya tenias un agente Seyben para esta tienda, lo hemos reactivado."
        : `Agente Seyben creado. Ha aprendido ${
            Number(data.products_count ?? 0)
          } productos y ${
            Number(data.pages_count ?? 0)
          } paginas directamente desde tu Shopify.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[seyben] shopify_install error", msg);
    return { ok: false, message: `Error de red llamando a Seyben: ${msg}` };
  }
};

// ============================================================================
// VISTA — Wizard de configuracion del agente
// ============================================================================
export default function Index() {
  const { shop, productsCount, shopDomain } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const isSubmitting = fetcher.state === "submitting";

  const [name, setName] = useState<string>(shop?.name || "Asistente");
  const [language, setLanguage] = useState<string>("Espanol");
  const [tone, setTone] = useState<string>("Cercano e informal");
  const [color, setColor] = useState<string>("#7c3aed");
  const [actionText, setActionText] = useState<string>("Habla con nosotros");
  const [position, setPosition] = useState<string>("bottom-right");
  // El wizard siempre crea el agente en plan Free. El upgrade a Starter/Pro se
  // hace desde /app/pricing via Shopify Billing API.
  const plan = "free";
  const [ownerName, setOwnerName] = useState<string>("");
  const [ownerEmail, setOwnerEmail] = useState<string>(shop?.contactEmail || "");

  const submit = () => {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("language", language);
    fd.set("tone", tone);
    fd.set("color", color);
    fd.set("actionText", actionText);
    fd.set("position", position);
    fd.set("plan", plan);
    fd.set("ownerName", ownerName);
    fd.set("ownerEmail", ownerEmail);
    fetcher.submit(fd, { method: "POST" });
    shopify.toast.show("Creando tu agente Seyben…");
  };

  const PRESET_COLORS = [
    "#7c3aed", // violeta
    "#3b82f6", // azul
    "#06b6d4", // cyan
    "#22c55e", // verde
    "#f97316", // naranja
    "#ec4899", // rosa
  ];

  return (
    <s-page heading="Configura tu agente Seyben">
      <s-button slot="primary-action" onClick={submit} {...(isSubmitting ? { loading: true } : {})}>
        {isSubmitting ? "Creando…" : "Crear agente y activar"}
      </s-button>

      {/* ============ INTRO ============ */}
      <s-section heading={`Hola ${shop?.name ?? "tienda"} 👋`}>
        <s-paragraph>
          Vamos a crear tu asistente de IA que atendera a tus visitantes 24/7 en{" "}
          <strong>{shopDomain}</strong>. Seyben analizara tu tienda automaticamente
          y respondera dudas sobre productos, envios, devoluciones y mas.
        </s-paragraph>
      </s-section>

      {/* ============ PASO 1: Informacion del agente ============ */}
      <s-section heading="1. Informacion del agente">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Nombre del agente"
            value={name}
            onChange={readValue(setName)}
          />
          <s-text tone="neutral">
            El nombre que veran tus visitantes (ej: Sofia, Asistente, ChatTienda)
          </s-text>

          <s-select
            label="Idioma principal"
            value={language}
            onChange={readValue(setLanguage)}
          >
            <s-option value="Espanol">Espanol</s-option>
            <s-option value="English">English</s-option>
            <s-option value="Catala">Catala</s-option>
            <s-option value="Francais">Francais</s-option>
            <s-option value="Portugues">Portugues</s-option>
            <s-option value="Deutsch">Deutsch</s-option>
          </s-select>

          <s-select
            label="Tono de las respuestas"
            value={tone}
            onChange={readValue(setTone)}
          >
            <s-option value="Profesional">Profesional</s-option>
            <s-option value="Cercano e informal">Cercano e informal</s-option>
            <s-option value="Formal (usted)">Formal (usted)</s-option>
          </s-select>
        </s-stack>
      </s-section>

      {/* ============ PASO 2: Apariencia ============ */}
      <s-section heading="2. Apariencia del widget">
        <s-stack direction="block" gap="base">
          <s-paragraph>Color principal del widget en tu tienda:</s-paragraph>
          <s-stack direction="inline" gap="base">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: c,
                  border: color === c ? "3px solid #1a1a1a" : "2px solid #e1e1e1",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </s-stack>

          <s-text-field
            label="Texto del boton llamador"
            value={actionText}
            onChange={readValue(setActionText)}
          />
          <s-text tone="neutral">
            Ej: Habla con nosotros, Necesitas ayuda?, Pregunta a Sofia
          </s-text>

          <s-select
            label="Posicion en la tienda"
            value={position}
            onChange={readValue(setPosition)}
          >
            <s-option value="bottom-right">Abajo derecha (recomendado)</s-option>
            <s-option value="bottom-left">Abajo izquierda</s-option>
            <s-option value="top-right">Arriba derecha</s-option>
            <s-option value="top-left">Arriba izquierda</s-option>
          </s-select>
        </s-stack>
      </s-section>

      {/* ============ PASO 3: Datos del responsable ============ */}
      <s-section heading="3. Datos del responsable (para que te lleguen los leads)">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Tu nombre"
            value={ownerName}
            onChange={readValue(setOwnerName)}
          />
          <s-text-field
            label="Tu email"
            value={ownerEmail}
            onChange={readValue(setOwnerEmail)}
          />
          <s-text tone="neutral">
            Donde te avisaremos cuando alguien deje su contacto en el chat
          </s-text>
        </s-stack>
      </s-section>

      {/* ============ PASO 4: Plan ============ */}
      <s-section heading="4. Plan">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Empezaras en el plan <strong>Free</strong> (50 conversaciones/mes). Cuando quieras
            ampliar a Starter (500 conv) o Pro (2000 conv + voz) puedes activar el cobro
            con un click desde la pagina de planes.
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <s-button href="/app/pricing" variant="secondary">Ver planes y precios</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      {/* ============ SIDEBAR: Conocimiento detectado ============ */}
      <s-section slot="aside" heading="Conocimiento detectado">
        <s-stack direction="block" gap="base">
          <s-paragraph>Seyben usara esto para entrenar al agente:</s-paragraph>
          <s-stack direction="block" gap="small-200">
            <s-text>
              ✓ <strong>{productsCount}</strong> productos del catalogo
            </s-text>
            <s-text>✓ Politicas de envio y devolucion</s-text>
            <s-text>✓ Datos de contacto y horarios</s-text>
            <s-text>✓ Paginas de la tienda</s-text>
          </s-stack>
          <s-paragraph tone="neutral">Se actualiza automaticamente cada dia.</s-paragraph>
        </s-stack>
      </s-section>

      {/* ============ SIDEBAR: Que pasa al crear ============ */}
      <s-section slot="aside" heading="Que pasa al pulsar Crear">
        <s-unordered-list>
          <s-list-item>Se crea tu agente Seyben con la configuracion elegida</s-list-item>
          <s-list-item>Analizamos tu tienda y catalogo (30-90s)</s-list-item>
          <s-list-item>Activamos el widget en {shopDomain} automaticamente</s-list-item>
          <s-list-item>Empezara a atender visitantes y capturar leads</s-list-item>
        </s-unordered-list>
      </s-section>

      {/* ============ RESULTADO OK ============ */}
      {fetcher.data?.ok && (
        <s-section heading={fetcher.data.already_exists ? "Agente reactivado" : "Agente creado"}>
          <s-stack direction="block" gap="base">
            <s-paragraph>{fetcher.data.message}</s-paragraph>

            <s-stack direction="block" gap="small-200">
              <s-text>
                <strong>ID interno:</strong> {fetcher.data.lead_id}
              </s-text>
              {fetcher.data.elevenlabs_agent_id && (
                <s-text>
                  <strong>Agente de voz:</strong> {fetcher.data.elevenlabs_agent_id}
                </s-text>
              )}
              {!fetcher.data.already_exists && (
                <>
                  <s-text>
                    <strong>Productos aprendidos:</strong> {fetcher.data.products_count}
                  </s-text>
                  <s-text>
                    <strong>Paginas aprendidas:</strong> {fetcher.data.pages_count}
                  </s-text>
                  <s-text tone="neutral">
                    Knowledge base: {Number(fetcher.data.knowledge_chars || 0).toLocaleString()} caracteres
                    (leidos directamente de tu Shopify, sin scraping).
                  </s-text>
                </>
              )}
            </s-stack>

            <s-paragraph>
              Tu agente ya esta activo. Puedes seguir su rendimiento (conversaciones, leads
              capturados) desde el panel Seyben.
            </s-paragraph>

            <s-stack direction="inline" gap="base">
              <s-button
                href={`https://seyben.netlify.app/dashboard?client=${fetcher.data.lead_id}`}
                target="_blank"
                variant="primary"
              >
                Abrir panel Seyben
              </s-button>
              <s-button href="/app/pricing">
                Activar Starter o Pro
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {/* ============ RESULTADO ERROR ============ */}
      {fetcher.data && !fetcher.data.ok && (
        <s-section heading="No pudimos crear el agente">
          <s-paragraph>{fetcher.data.message}</s-paragraph>
          <s-paragraph tone="neutral">
            Puedes reintentar pulsando "Crear agente y activar". Si el problema persiste,
            contacta con soporte (jordiutges123@gmail.com).
          </s-paragraph>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
