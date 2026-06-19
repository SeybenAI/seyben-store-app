// Helpers de planes Seyben para Managed Pricing.
//
// IMPORTANTE: con Managed Pricing NO creamos cargos por codigo. Shopify gestiona
// el cobro desde su pagina de planes (el upgrade se abre desde app/routes/app.pricing.tsx).
// Aqui solo:
//   - definimos los planes (para mostrarlos en /app/pricing)
//   - leemos la subscripcion activa del merchant (para saber su plan actual)
// La sincronizacion de plan_tier en Supabase ocurre en el webhook
// app_subscriptions/update cuando el merchant cambia de plan en Shopify.

type AdminGql = {
  graphql: (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export const PLAN_DEFS = {
  starter: {
    key: "starter" as const,
    name: "Starter",
    price: 49,
    currency: "USD",
    interval: "EVERY_30_DAYS" as const,
    conversations: 500,
    voice: false,
    description: "Hasta 500 conversaciones/mes. Chat de texto + KB ilimitada.",
  },
  pro: {
    key: "pro" as const,
    name: "Pro",
    price: 70,
    currency: "USD",
    interval: "EVERY_30_DAYS" as const,
    conversations: 2000,
    voice: true,
    description: "Hasta 2000 conversaciones/mes. Incluye 150 minutos de voz.",
  },
} as const;

export type PaidPlanKey = keyof typeof PLAN_DEFS;
export type PlanKey = "free" | PaidPlanKey;

export const FREE_PLAN = {
  key: "free" as const,
  name: "Free",
  price: 0,
  currency: "USD",
  conversations: 50,
  voice: false,
  description: "50 conversaciones/mes. Para probar Seyben sin compromiso.",
} as const;

export function isPaidPlan(key: string): key is PaidPlanKey {
  return key === "starter" || key === "pro";
}

// ---------------------------------------------------------------------------
// Estado actual: subscripcion activa (si existe). Sigue funcionando igual con
// Managed Pricing porque la subscripcion la crea Shopify, no nosotros.
// ---------------------------------------------------------------------------
const CURRENT_SUBSCRIPTIONS_QUERY = /* GraphQL */ `
  query SeybenCurrentSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
        createdAt
        currentPeriodEnd
        trialDays
        lineItems {
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                price { amount currencyCode }
                interval
              }
            }
          }
        }
      }
    }
  }
`;

export type ActiveSubscription = {
  id: string;
  name: string;
  status: string;
  test: boolean;
  createdAt: string;
  currentPeriodEnd: string | null;
  trialDays: number | null;
  price: { amount: number; currencyCode: string } | null;
  interval: string | null;
  planKey: PaidPlanKey | null;
};

export async function getActiveSubscription(admin: AdminGql): Promise<ActiveSubscription | null> {
  const res = await admin.graphql(CURRENT_SUBSCRIPTIONS_QUERY);
  const data = (await res.json()).data as {
    currentAppInstallation?: {
      activeSubscriptions?: {
        id: string;
        name: string;
        status: string;
        test: boolean;
        createdAt: string;
        currentPeriodEnd: string | null;
        trialDays: number | null;
        lineItems: { plan: { pricingDetails: { price?: { amount: number; currencyCode: string }; interval?: string } } }[];
      }[];
    };
  };
  const subs = data?.currentAppInstallation?.activeSubscriptions || [];
  const sub = subs.find((s) => s.status === "ACTIVE") || subs[0];
  if (!sub) return null;
  const item = sub.lineItems?.[0]?.plan?.pricingDetails;
  // Deducir planKey por matching de precio
  let planKey: PaidPlanKey | null = null;
  const amount = item?.price?.amount;
  if (amount === PLAN_DEFS.starter.price) planKey = "starter";
  else if (amount === PLAN_DEFS.pro.price) planKey = "pro";
  return {
    id: sub.id,
    name: sub.name,
    status: sub.status,
    test: sub.test,
    createdAt: sub.createdAt,
    currentPeriodEnd: sub.currentPeriodEnd,
    trialDays: sub.trialDays,
    price: item?.price ?? null,
    interval: item?.interval ?? null,
    planKey,
  };
}
