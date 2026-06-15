// Webhook app_subscriptions/update: Shopify nos avisa cuando una subscripcion
// cambia de estado (activa/cancelada/declinada/expirada). Aqui resincronizamos
// el plan en Supabase para reflejar la verdad.
//
// El payload trae { app_subscription: { id, status, name, line_items: [...] } }.
// Mapeamos status Shopify -> subscription_status nuestro:
//   ACTIVE   -> active
//   FROZEN   -> past_due
//   CANCELLED -> cancelled  (degradamos plan_tier a free)
//   DECLINED -> cancelled
//   EXPIRED  -> cancelled
//   PENDING  -> pending

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

type SubscriptionPayload = {
  app_subscription?: {
    id?: string | number;
    admin_graphql_api_id?: string;
    status?: string;
    name?: string;
    test?: boolean;
    line_items?: Array<{
      plan?: {
        pricing_details?: {
          price?: { amount?: string | number; currency_code?: string };
          interval?: string;
        };
      };
    }>;
  };
};

function mapStatus(shopifyStatus: string): { sub: string; tier: string | null } {
  const s = (shopifyStatus || "").toUpperCase();
  if (s === "ACTIVE") return { sub: "active", tier: null }; // tier se deduce del precio
  if (s === "FROZEN") return { sub: "past_due", tier: null };
  if (s === "PENDING") return { sub: "pending", tier: null };
  // cancelled / declined / expired -> degradamos a free
  return { sub: "cancelled", tier: "free" };
}

function tierFromAmount(amount: number | null): string | null {
  if (amount === 49) return "starter";
  if (amount === 70) return "pro";
  return null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`[seyben] webhook ${topic} from ${shop}`);

  const sub = (payload as SubscriptionPayload)?.app_subscription;
  if (!sub?.status) {
    console.warn(`[seyben] ${topic}: payload sin status`, sub);
    return new Response();
  }

  const { sub: subStatus, tier: forcedTier } = mapStatus(sub.status);
  const amountRaw = sub.line_items?.[0]?.plan?.pricing_details?.price?.amount;
  const amount = amountRaw ? Number(amountRaw) : null;
  const tier = forcedTier ?? tierFromAmount(amount) ?? "free";

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SHOPIFY_INSTALL_SECRET = process.env.SHOPIFY_INSTALL_SECRET;
  if (!SUPABASE_URL || !SHOPIFY_INSTALL_SECRET) {
    console.error(`[seyben] ${topic}: missing env`);
    return new Response();
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/shopify_set_plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-shopify-install-secret": SHOPIFY_INSTALL_SECRET,
      },
      body: JSON.stringify({
        shop_domain: shop,
        plan_tier: tier,
        subscription_id: sub.admin_graphql_api_id || (sub.id != null ? String(sub.id) : null),
        subscription_status: subStatus,
        is_test: sub.test === true,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error(`[seyben] shopify_set_plan (webhook) failed ${res.status}: ${t.slice(0, 300)}`);
    }
  } catch (err) {
    console.error(`[seyben] ${topic} sync error:`, err);
  }

  return new Response();
};
