// Shopify Billing API helpers.
//
// Modelo: una sola subscripcion recurrente por install. Cuando el merchant
// quiere cambiar de plan: cancelamos la actual y creamos otra. Shopify les
// prorratea automaticamente.
//
// En dev stores marcamos test:true para que Shopify no cobre. En produccion
// detectamos si la tienda es de desarrollo (shop.plan_displayName contiene
// "Developer Preview" o "Plus Sandbox") para mantener test:true sin tener
// que tocar codigo.

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
    description: "Hasta 2000 conversaciones/mes. Incluye llamadas por voz con ElevenLabs.",
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
// Detectar si es development store -> test:true en la subscripcion
// ---------------------------------------------------------------------------
const SHOP_PLAN_QUERY = /* GraphQL */ `
  query SeybenShopPlan {
    shop {
      myshopifyDomain
      plan { displayName partnerDevelopment shopifyPlus }
    }
  }
`;

type ShopPlanResp = {
  shop: {
    myshopifyDomain: string;
    plan: { displayName: string; partnerDevelopment: boolean; shopifyPlus: boolean };
  };
};

async function shouldUseTestBilling(admin: AdminGql): Promise<boolean> {
  try {
    const res = await admin.graphql(SHOP_PLAN_QUERY);
    const data = (await res.json()).data as ShopPlanResp;
    // partnerDevelopment = development store de un partner. Shopify exige test:true.
    return Boolean(data?.shop?.plan?.partnerDevelopment);
  } catch (err) {
    console.warn("[billing] shop plan lookup failed, assuming test=true:", err);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Crear subscripcion -> devuelve confirmationUrl para redirigir al merchant
// ---------------------------------------------------------------------------
const CREATE_SUBSCRIPTION_MUTATION = /* GraphQL */ `
  mutation SeybenCreateSubscription(
    $name: String!
    $returnUrl: URL!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $test: Boolean
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      lineItems: $lineItems
      test: $test
    ) {
      userErrors { field message }
      confirmationUrl
      appSubscription { id name status test }
    }
  }
`;

export async function createSubscription(
  admin: AdminGql,
  planKey: PaidPlanKey,
  returnUrl: string,
): Promise<{ confirmationUrl: string; subscriptionId: string; test: boolean }> {
  const plan = PLAN_DEFS[planKey];
  if (!plan) throw new Error(`Plan desconocido: ${planKey}`);

  const test = await shouldUseTestBilling(admin);

  const variables = {
    name: `Seyben ${plan.name}`,
    returnUrl,
    test,
    lineItems: [{
      plan: {
        appRecurringPricingDetails: {
          price: { amount: plan.price, currencyCode: plan.currency },
          interval: plan.interval,
        },
      },
    }],
  };

  const res = await admin.graphql(CREATE_SUBSCRIPTION_MUTATION, { variables });
  const data = (await res.json()).data as {
    appSubscriptionCreate: {
      userErrors: { field: string[]; message: string }[];
      confirmationUrl: string | null;
      appSubscription: { id: string; status: string; test: boolean } | null;
    };
  };

  const result = data?.appSubscriptionCreate;
  if (!result) throw new Error("appSubscriptionCreate sin respuesta");
  if (result.userErrors?.length) {
    throw new Error(
      "appSubscriptionCreate errors: " +
        result.userErrors.map((e) => `${(e.field || []).join(".")}: ${e.message}`).join(" | "),
    );
  }
  if (!result.confirmationUrl || !result.appSubscription) {
    throw new Error("appSubscriptionCreate sin confirmationUrl");
  }
  return {
    confirmationUrl: result.confirmationUrl,
    subscriptionId: result.appSubscription.id,
    test: result.appSubscription.test,
  };
}

// ---------------------------------------------------------------------------
// Cancelar subscripcion existente (para cambiar de plan)
// ---------------------------------------------------------------------------
const CANCEL_SUBSCRIPTION_MUTATION = /* GraphQL */ `
  mutation SeybenCancelSubscription($id: ID!) {
    appSubscriptionCancel(id: $id) {
      userErrors { field message }
      appSubscription { id status }
    }
  }
`;

export async function cancelSubscription(admin: AdminGql, id: string): Promise<void> {
  const res = await admin.graphql(CANCEL_SUBSCRIPTION_MUTATION, { variables: { id } });
  const data = (await res.json()).data as {
    appSubscriptionCancel: { userErrors: { message: string }[] };
  };
  const errs = data?.appSubscriptionCancel?.userErrors;
  if (errs?.length) {
    throw new Error("Cancel errors: " + errs.map((e) => e.message).join("; "));
  }
}

// ---------------------------------------------------------------------------
// Estado actual: subscripcion activa (si existe)
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
