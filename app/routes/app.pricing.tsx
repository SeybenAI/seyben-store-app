import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  PLAN_DEFS,
  FREE_PLAN,
  getActiveSubscription,
} from "../lib/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const active = await getActiveSubscription(admin).catch((e) => {
    console.warn("[pricing] active sub lookup failed:", e);
    return null;
  });
  return {
    active,
    plans: {
      free: FREE_PLAN,
      starter: PLAN_DEFS.starter,
      pro: PLAN_DEFS.pro,
    },
  };
};

export default function Pricing() {
  const { active, plans } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const currentKey = active?.planKey ?? "free";

  const upgrade = (planKey: "starter" | "pro") => {
    // Navegacion interna; la ruta /app/billing/activate/$plan se encarga del
    // redirect a la URL de confirmacion de Shopify (top-level via App Bridge).
    navigate(`/app/billing/activate/${planKey}`);
  };

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
            <s-text>✓ Chat de texto con IA</s-text>
            <s-text>✓ Sync en tiempo real con tu catalogo</s-text>
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
            <s-text>✓ Chat de texto con IA</s-text>
            <s-text>✓ Sync en tiempo real con tu catalogo</s-text>
            <s-text>✓ Soporte por email</s-text>
          </s-stack>
          {currentKey === "starter" ? (
            <s-badge tone="success">Plan actual</s-badge>
          ) : (
            <s-button onClick={() => upgrade("starter")}>
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
            <s-text>✓ Llamadas por voz con ElevenLabs</s-text>
            <s-text>✓ Chat de texto con IA</s-text>
            <s-text>✓ Sync en tiempo real con tu catalogo</s-text>
            <s-text>✓ Soporte prioritario</s-text>
          </s-stack>
          {currentKey === "pro" ? (
            <s-badge tone="success">Plan actual</s-badge>
          ) : (
            <s-button variant="primary" onClick={() => upgrade("pro")}>
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
