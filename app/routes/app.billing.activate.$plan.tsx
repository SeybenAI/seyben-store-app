// /app/billing/activate/:plan
//
// El merchant pulsa "Activar Pro" en /app/pricing -> aterriza aqui.
// Creamos la AppSubscription en Shopify y redirigimos a la confirmationUrl
// (la pagina nativa de Shopify donde el merchant acepta el cargo).
//
// La redireccion se hace top-level via App Bridge porque el admin Shopify
// vive en iframe y appSubscriptionCreate devuelve una URL fuera del iframe.
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { createSubscription, isPaidPlan } from "../lib/billing.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const planKey = String(params.plan || "");
  if (!isPaidPlan(planKey)) {
    return { ok: false, error: `Plan invalido: ${planKey}`, confirmationUrl: null };
  }

  // La returnUrl es donde Shopify nos manda al merchant despues de aprobar.
  // Apuntamos a /app/billing/confirm para que sepamos que vuelve del flow.
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  const returnUrl = `${appUrl.replace(/\/$/, "")}/app/billing/confirm?shop=${
    encodeURIComponent(session.shop)
  }&plan=${encodeURIComponent(planKey)}`;

  try {
    const result = await createSubscription(admin, planKey, returnUrl);
    return {
      ok: true as const,
      confirmationUrl: result.confirmationUrl,
      planKey,
      test: result.test,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[billing/activate] createSubscription failed:", msg);
    return { ok: false as const, error: msg, confirmationUrl: null };
  }
};

export default function BillingActivate() {
  const data = useLoaderData<typeof loader>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (data.ok && data.confirmationUrl) {
      // Top-level redirect: el admin esta en iframe, Shopify confirmation lo
      // requiere fuera. Usar window.top es la forma recomendada.
      if (window.top && data.confirmationUrl) {
        window.top.location.href = data.confirmationUrl;
      } else if (data.confirmationUrl) {
        window.location.href = data.confirmationUrl;
      }
    } else if (!data.ok) {
      shopify.toast.show(`No se pudo iniciar el cobro: ${data.error}`, { isError: true });
    }
  }, [data, shopify]);

  if (!data.ok) {
    return (
      <s-page heading="No se pudo activar el plan">
        <s-section>
          <s-paragraph>{data.error}</s-paragraph>
          <s-button href="/app/pricing">Volver a planes</s-button>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Redirigiendo a Shopify…">
      <s-section>
        <s-paragraph>
          Te estamos llevando a la pagina de aprobacion de Shopify para activar el plan{" "}
          <strong>{data.planKey}</strong>
          {data.test && " (modo prueba — no se cobrara)"}.
        </s-paragraph>
        <s-paragraph tone="neutral">
          Si no te redirige automaticamente,{" "}
          <a href={data.confirmationUrl ?? "#"} target="_top">pulsa aqui</a>.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
