// Webhook app/uninstalled: el merchant desinstalo la app desde Shopify.
// Acciones:
//   1. Borrar sesion local (Prisma) para no quedarnos con tokens caducados.
//   2. Avisar a Seyben (edge function shopify_uninstall) para marcar el
//      install como inactivo y dejar de servir el widget en su tienda.

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`[seyben] webhook ${topic} for ${shop}`);

  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SHOPIFY_INSTALL_SECRET = process.env.SHOPIFY_INSTALL_SECRET;
  if (SUPABASE_URL && SHOPIFY_INSTALL_SECRET) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/shopify_uninstall`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shopify-install-secret": SHOPIFY_INSTALL_SECRET,
        },
        body: JSON.stringify({ shop_domain: shop }),
      });
      if (!res.ok) {
        console.error(
          `[seyben] shopify_uninstall failed (${res.status}): ` +
            (await res.text().catch(() => "")).slice(0, 300),
        );
      }
    } catch (err) {
      console.error("[seyben] shopify_uninstall network error:", err);
    }
  }

  return new Response();
};
