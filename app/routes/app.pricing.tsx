import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  PLAN_DEFS,
  FREE_PLAN,
  getActiveSubscription,
} from "../lib/billing.server";

// Handle de la app (campo `name` de shopify.app.toml).
const APP_HANDLE = "seyben-store-app";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const active = await getActiveSubscription(admin).catch((e) => {
    console.warn("[pricing] active sub lookup failed:", e);
    return null;
  });
  // URL de la pagina de planes gestionada por Shopify (Managed Pricing).
  // storeHandle = subdominio myshopify (igual que hace el helper de Shopify).
  const storeHandle = session.shop.replace(/\.myshopify\.com$/, "");
  const managedPricingUrl = `https://admin.shopify.com/store/${storeHandle}/charges/${APP_HANDLE}/pricing_plans`;
  return {
    active,
    managedPricingUrl,
    plans: {
      free: FREE_PLAN,
      starter: PLAN_DEFS.starter,
      pro: PLAN_DEFS.pro,
    },
  };
};

export default function Pricing() {
  const { active, plans, managedPricingUrl } = useLoaderData<typeof loader>();

  const currentKey = active?.planKey ?? "free";

  // Managed Pricing: el upgrade/cambio abre la pagina de planes gestionada por
  // Shopify. Lo hacemos con window.open(..., "_top") en el click (gesto del
  // usuario) para escapar del iframe del admin SIN pasar por un loader que
  // re-autentique (eso daba 401). Shopify gestiona el cobro; el plan se
  // sincroniza luego por el webhook app_subscriptions/update.
  const openPlans = () => window.open(managedPricingUrl, "_top");

  return (
    <s-page heading="Planes Seyben">
      <s-section heading="Tu plan actual">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Estas en el plan <strong>{plans[currentKey].name}</strong>
            {active?.test && " (modo prueba — esta es una development store, no se cobra)"}
            .
          </s-paragraph>
          {active && (
            <s-text tone="neutral">
              Subscripcion activa desde {new Date(active.createdAt).toLocaleDateString()}.
              {active.currentPeriodEnd &&
                ` Siguiente cobro: ${new Date(active.currentPeriodEnd).toLocaleDateString()}.`}
            </s-text>
          )}
        </s-stack>
      </s-section>

      {/* FREE */}
      <s-section heading={`${plans.free.name} — gratis`}>
        <s-stack direction="block" gap="base">
          <s-paragraph>{plans.free.description}</s-paragraph>
          <s-stack direction="block" gap="small-200">
            <s-text>✓ {plans.free.conversations} conversaciones/mes</s-text>
            <s-text>✓ Conocimiento exhaustivo de TODA tu tienda: catalogo, precios, envios, devoluciones y FAQs</s-text>
            <s-text tone="neutral">✕ Sin voz</s-text>
          </s-stack>
          {currentKey === "free" && <s-badge tone="info">Plan actual</s-badge>}
        </s-stack>
      </s-section>

      {/* STARTER */}
      <s-section heading={`${plans.starter.name} — ${plans.starter.price} USD/mes`}>
        <s-stack direction="block" gap="base">
          <s-paragraph>{plans.starter.description}</s-paragraph>
          <s-stack direction="block" gap="small-200">
            <s-text>✓ {plans.starter.conversations} conversaciones/mes</s-text>
            <s-text>✓ Conocimiento exhaustivo de TODA tu tienda: catalogo, precios, envios, devoluciones y FAQs</s-text>
            <s-text>✓ Soporte por email</s-text>
            <s-text>✓ 15 dias gratis</s-text>
            <s-text tone="neutral">✕ Sin voz</s-text>
          </s-stack>
          {currentKey === "starter" ? (
            <s-badge tone="success">Plan actual</s-badge>
          ) : (
            <s-button onClick={openPlans}>
              {currentKey === "free" ? "Activar Starter" : "Cambiar a Starter"}
            </s-button>
          )}
        </s-stack>
      </s-section>

      {/* PRO */}
      <s-section heading={`${plans.pro.name} — ${plans.pro.price} USD/mes`}>
        <s-stack direction="block" gap="base">
          <s-paragraph>{plans.pro.description}</s-paragraph>
          <s-stack direction="block" gap="small-200">
            <s-text>✓ {plans.pro.conversations} conversaciones/mes</s-text>
            <s-text>✓ Conocimiento exhaustivo de TODA tu tienda: catalogo, precios, envios, devoluciones y FAQs</s-text>
            <s-text>✓ Voz activada (150 minutos incluidos)</s-text>
            <s-text>✓ Soporte prioritario</s-text>
            <s-text>✓ 15 dias gratis</s-text>
          </s-stack>
          {currentKey === "pro" ? (
            <s-badge tone="success">Plan actual</s-badge>
          ) : (
            <s-button variant="primary" onClick={openPlans}>
              {currentKey === "free" ? "Activar Pro" : "Cambiar a Pro"}
            </s-button>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Como funciona el cobro" slot="aside">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Pagas a traves de tu factura de Shopify. Shopify se queda con su comision
            (15%) y nos transfiere el resto. Puedes cancelar en cualquier momento
            desde el panel de subscripciones de tu admin.
          </s-paragraph>
          <s-paragraph tone="neutral">
            Las development stores no se cobran (Shopify marca la subscripcion como test).
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (h) => boundary.headers(h);
