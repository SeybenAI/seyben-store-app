// Privacy Policy publica - requisito Shopify para apps listadas en App Store.
// URL: https://seyben-store-app.netlify.app/privacy
//
// Esta pagina cubre los requisitos minimos GDPR + Shopify:
//   - Que datos recogemos
//   - Para que
//   - Donde se guardan y con quien se comparten (sub-procesadores)
//   - Cuanto tiempo se conservan
//   - Derechos del usuario y como ejercerlos
//   - Contacto para data requests
//
// NO usar templates genericos online sin revisar. Lo justo y honesto.

import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — Seyben for Shopify" },
  { name: "robots", content: "index,follow" },
];

const LAST_UPDATED = "15 de junio de 2026";
const CONTACT_EMAIL = "jordiutges123@gmail.com";

export default function Privacy() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "48px 24px 96px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        lineHeight: 1.6,
        color: "#1a1a1a",
      }}
    >
      <h1>Privacy Policy</h1>
      <p style={{ color: "#666" }}>Last updated: {LAST_UPDATED}</p>

      <p>
        Seyben ("we", "us") provides an AI chatbot widget for Shopify stores.
        This Privacy Policy explains what data we process when a merchant
        installs the Seyben app on their Shopify store, why we process it,
        and the rights merchants and their store visitors have.
      </p>

      <h2>1. Who we are</h2>
      <p>
        Seyben is operated by Jordi Utges. You can reach us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>2. Data we process</h2>
      <p>When a merchant installs the Seyben app on their Shopify store we read:</p>
      <ul>
        <li>
          <strong>Shop information</strong>: shop name, contact email, currency,
          billing address (city / country), primary domain, Shopify shop domain.
        </li>
        <li>
          <strong>Catalog</strong>: product titles, descriptions, vendors, types,
          tags, handles, variants (price, SKU, stock, availability).
        </li>
        <li>
          <strong>Collections</strong>: titles and descriptions.
        </li>
        <li>
          <strong>Pages and policies</strong>: title and body of the merchant's
          published pages and legal policies (privacy, refund, shipping, terms).
        </li>
        <li>
          <strong>Merchant identity</strong>: owner name and email, provided by
          the merchant during onboarding.
        </li>
        <li>
          <strong>Conversation transcripts</strong>: when a visitor of the
          merchant's storefront chats with the Seyben agent, the conversation
          transcript is stored to give the merchant visibility over leads and
          to evaluate response quality. Visitors who voluntarily share their
          contact details in chat (email, phone, name) are stored as leads.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> read customer personal data from the Shopify
        Admin API (no orders, no customer profiles, no payment data). We do not
        request <code>read_customers</code> or <code>read_orders</code> scopes.
      </p>

      <h2>3. Why we process this data</h2>
      <ul>
        <li>To train the AI agent on the merchant's catalog so it can answer
          visitor questions accurately.</li>
        <li>To keep the agent's knowledge in sync when the merchant updates
          products, collections or shop settings.</li>
        <li>To deliver the chat widget on the merchant's storefront.</li>
        <li>To bill the merchant via Shopify Billing API for paid plans.</li>
        <li>To support the merchant when they contact us.</li>
      </ul>

      <h2>4. Sub-processors</h2>
      <p>
        We share data with the following sub-processors strictly to operate the
        service:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> (database and edge functions, hosted in the
          EU): stores shop installs, agent configuration, knowledge base text,
          conversation transcripts and leads.
        </li>
        <li>
          <strong>Netlify</strong> (hosting of the Shopify embedded app):
          processes HTTP requests for the admin interface.
        </li>
        <li>
          <strong>ElevenLabs</strong> (voice & conversational AI provider):
          hosts the agent's knowledge base document, runs the conversational
          model, and provides voice synthesis. May process conversation content
          in transit.
        </li>
        <li>
          <strong>Google Gemini</strong> and <strong>Anthropic Claude</strong>{" "}
          (large language model providers): used to generate the agent's system
          prompt from the catalog summary at install time. Catalog text is sent
          to these providers in the prompt.
        </li>
        <li>
          <strong>Shopify</strong> (the platform itself): processes app
          authentication, billing and webhook delivery.
        </li>
      </ul>

      <h2>5. Where data is stored</h2>
      <p>
        Primary storage is in Supabase Postgres hosted in the European Union.
        ElevenLabs processes data globally according to its own privacy policy
        (<a
          href="https://elevenlabs.io/privacy-policy"
          target="_blank"
          rel="noreferrer noopener"
        >
          elevenlabs.io/privacy-policy
        </a>
        ).
      </p>

      <h2>6. How long we keep data</h2>
      <ul>
        <li>
          While the app is installed: catalog and knowledge base data are kept
          fresh and overwritten on each sync.
        </li>
        <li>
          When the merchant uninstalls the app: we mark the shop as inactive
          immediately. The Shopify <code>shop/redact</code> webhook (fired 48
          hours after uninstall) triggers full deletion of the merchant's
          configuration, knowledge base document in ElevenLabs and ElevenLabs
          agent.
        </li>
        <li>
          Conversation transcripts: kept for 12 months after the conversation
          for analytics, then deleted.
        </li>
      </ul>

      <h2>7. Your rights</h2>
      <p>
        If you are a merchant or a store visitor and want to access, correct,
        export or delete your data, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will reply
        within 30 days. Merchants can also request data deletion directly from
        the Shopify admin via the standard{" "}
        <code>customers/data_request</code> and <code>customers/redact</code>{" "}
        flows.
      </p>

      <h2>8. Security</h2>
      <p>
        Data in transit is encrypted with TLS. Database access is restricted to
        Supabase service-role credentials, stored only as Netlify environment
        variables. API tokens to Shopify, ElevenLabs and LLM providers are
        stored encrypted in environment configuration.
      </p>

      <h2>9. Changes to this policy</h2>
      <p>
        We may update this policy when our practices change. We will update the
        "Last updated" date and, for material changes, notify installed
        merchants by email.
      </p>

      <h2>10. Contact</h2>
      <p>
        Privacy questions:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </main>
  );
}
