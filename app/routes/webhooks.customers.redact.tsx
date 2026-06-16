// GDPR webhook: customers/redact
//
// Shopify lo dispara cuando un cliente solicita el borrado de sus datos
// personales (right to be forgotten). Lo dispara 10 dias despues del
// data_request, asi que tenemos tiempo de procesar.
//
// Como Seyben NO pide scope read_customers, no almacenamos datos personales
// identificados de clientes. Si en el futuro tuvieramos transcripciones de
// chat con email asociado, aqui las borrariamos por customer.email.

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`[seyben] GDPR ${topic} from ${shop}:`, JSON.stringify(payload).slice(0, 500));

  // TODO (cuando capturemos datos identificables de clientes finales):
  //   - Borrar leads por customer email del payload
  //   - Borrar transcripts por customer email del payload

  return new Response();
};
