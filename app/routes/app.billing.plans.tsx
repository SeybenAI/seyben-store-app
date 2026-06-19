// /app/billing/plans
//
// Managed Pricing: NO creamos cargos por codigo (eso lo prohibe Shopify cuando
// la app esta en Managed Pricing). Redirigimos al merchant a la pagina de planes
// gestionada por Shopify, que se encarga del cobro, la confirmacion y el prorrateo.
// El cambio de plan nos llega luego via el webhook app_subscriptions/update, que
// sincroniza plan_tier en Supabase.
//
// Usamos la ruta `shopify://admin/...`: el helper redirect de
// @shopify/shopify-app-react-router la convierte sola en
// https://admin.shopify.com/store/<tienda>/charges/<app-handle>/pricing_plans
// y la abre con target _top (fuera del iframe del admin).
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Handle de la app (campo `name` de shopify.app.toml).
const APP_HANDLE = "seyben-store-app";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { redirect } = await authenticate.admin(request);
  return redirect(`shopify://admin/charges/${APP_HANDLE}/pricing_plans`, {
    target: "_top",
  });
};
