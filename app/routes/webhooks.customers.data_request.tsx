// GDPR webhook: customers/data_request
//
// Shopify lo dispara cuando un cliente de la tienda solicita ver sus datos
// (via el merchant). Shopify nos manda el payload con shop_id, customer info
// y orders_requested para identificar qué datos pide.
//
// Como Seyben NO pide scope read_customers ni read_orders, no almacenamos
// datos personales de clientes finales identificados. Lo unico que podriamos
// tener son transcripciones de chat anonimas (sin email asociado), y leads
// (visitantes que dejaron contacto voluntariamente).
//
// Respuesta: 200 OK + logueo. Si en el futuro empezamos a recoger mas
// datos del cliente, enriquecer este handler para devolver via email los
// transcripts/leads asociados al customer.id o email.

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`[seyben] GDPR ${topic} from ${shop}:`, JSON.stringify(payload).slice(0, 500));

  // En el futuro: buscar leads/transcripts asociados al customer.email del
  // payload y enviar resumen por email al soporte para coordinar entrega.
  // Por ahora solo acknowledge.

  return new Response();
};
