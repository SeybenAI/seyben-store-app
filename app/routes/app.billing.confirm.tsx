// /app/billing/confirm?shop=...&plan=...&charge_id=...
//
// Shopify nos manda aqui despues de que el merchant apruebe (o cancele) la
// AppSubscription. Verificamos el estado real consultando GraphQL y luego:
//   - Si ACTIVE -> notificamos al backend Seyben (edge function shopify_set_plan)
//     para que actualice plan_tier en clients y shopify_installs.
//   - Si DECLINED / CANCELLED -> volvemos a /app/pricing con toast.
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getActiveSubscription, isPaidPlan } from "../lib/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const plan = String(url.searchParams.get("plan") || "");
  if (!isPaidPlan(plan)) {
    throw redirect("/app/pricing");
  }

  // 1. Comprobar subscripcion activa
  const active = await getActiveSubscription(admin);
  const status = active?.status ?? "MISSING";

  if (status !== "ACTIVE") {
    // El merchant cancelo o no acepto. Volver a pricing.
    return {
      ok: false as const,
      status,
      message: status === "DECLINED"
        ? "Has rechazado el cobro. Tu plan sigue siendo Free."
        : `La subscripcion no esta activa (estado: ${status}). Si crees que es un error, vuelve a intentarlo.`,
    };
  }

  // 2. Sincronizar plan_tier en Supabase (clients + shopify_installs)
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SHOPIFY_INSTALL_SECRET = process.env.SHOPIFY_INSTALL_SECRET;
  if (!SUPABASE_URL || !SHOPIFY_INSTALL_SECRET) {
    return {
      ok: false as const,
      status,
      message: "Plan activado en Shopify pero falta config en el servidor para sincronizar.",
    };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/shopify_set_plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-shopify-install-secret": SHOPIFY_INSTALL_SECRET,
      },
      body: JSON.stringify({
        shop_domain: session.shop,
        plan_tier: plan,
        subscription_id: active.id,
        subscription_status: "active",
        is_test: active.test,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[billing/confirm] shopify_set_plan failed:", res.status, text.slice(0, 300));
      return {
        ok: false as const,
        status,
        message: `Plan aprobado en Shopify pero no se pudo sincronizar con Seyben (HTTP ${res.status}). Contacta con soporte.`,
      };
    }
  } catch (err) {
    console.error("[billing/confirm] shopify_set_plan error:", err);
    return {
      ok: false as const,
      status,
      message: "Plan aprobado en Shopify pero hubo un error de red sincronizando con Seyben.",
    };
  }

  return {
    ok: true as const,
    status,
    plan,
    test: active.test,
  };
};

export default function BillingConfirm() {
  const data = useLoaderData<typeof loader>();

  if (data.ok) {
    return (
      <s-page heading={`Plan ${data.plan} activado`}>
        <s-section>
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Tu plan <strong>{data.plan}</strong> ya esta activo
              {data.test && " (modo prueba — Shopify no cobrara nada)"}.
              Las nuevas funcionalidades estan disponibles inmediatamente.
            </s-paragraph>
            <s-stack direction="inline" gap="base">
              <s-button href="/app" variant="primary">Volver al panel</s-button>
              <s-button href="/app/pricing">Ver planes</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="No pudimos activar el plan">
      <s-section>
        <s-stack direction="block" gap="base">
          <s-paragraph>{data.message}</s-paragraph>
          <s-text tone="neutral">Estado de la subscripcion: {data.status}</s-text>
          <s-button href="/app/pricing">Volver a planes</s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (h) => boundary.headers(h);
