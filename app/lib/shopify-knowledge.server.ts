// Construye el knowledge_payload a partir de la Admin API de Shopify.
// Se llama desde el action de app._index.tsx justo antes de invocar shopify_install.
//
// Devuelve un objeto autocontenido con: shop info, productos (con variantes y
// precios), paginas, politicas y colecciones. Todo via GraphQL — cero scraping.

type AdminGql = {
  graphql: (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export type ShopifyVariant = {
  title?: string;
  price?: string;
  sku?: string;
  availableForSale?: boolean;
  inventoryQuantity?: number;
};
export type ShopifyProduct = {
  title: string;
  description?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  handle?: string;
  status?: string;
  variants?: ShopifyVariant[];
};
export type ShopifyPage = { title: string; bodyHtml?: string; handle?: string };
export type ShopifyPolicy = { title: string; body?: string };
export type ShopifyKnowledgePayload = {
  shop: {
    name?: string;
    primaryDomain?: string;
    contactEmail?: string;
    address?: string;
    currencyCode?: string;
  };
  products: ShopifyProduct[];
  pages: ShopifyPage[];
  policies: ShopifyPolicy[];
  collections: { title: string; description?: string }[];
};

const PAGE_SIZE = 50;
const MAX_PRODUCTS = 250;
const MAX_PAGES = 50;
const MAX_COLLECTIONS = 50;

type GqlResp<T> = { data?: T; errors?: { message: string }[] };
async function gql<T>(
  admin: AdminGql,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await admin.graphql(query, variables ? { variables } : undefined);
  const json = (await res.json()) as GqlResp<T>;
  if (json.errors?.length) {
    throw new Error("Admin GraphQL: " + json.errors.map((e) => e.message).join(" | "));
  }
  if (!json.data) throw new Error("Admin GraphQL devolvio sin data");
  return json.data;
}

// ---------------------------------------------------------------------------
// Shop info + politicas (todo en una query)
// ---------------------------------------------------------------------------
const SHOP_QUERY = /* GraphQL */ `
  query SeybenShopFull {
    shop {
      name
      contactEmail
      currencyCode
      primaryDomain { host url }
      billingAddress {
        address1 address2 city province country zip
      }
      shipsToCountries
    }
  }
`;

type ShopResp = {
  shop: {
    name: string;
    contactEmail?: string;
    currencyCode: string;
    primaryDomain: { host: string; url: string };
    billingAddress?: Record<string, string | null>;
  };
};

// Politicas legales - query separada porque requiere scope read_legal_policies
// que puede no estar concedido. Si falla, seguimos sin politicas.
const POLICIES_QUERY = /* GraphQL */ `
  query SeybenPolicies {
    shop {
      shopPolicies { title body }
    }
  }
`;

type PoliciesResp = {
  shop: { shopPolicies?: { title: string; body: string }[] };
};

// ---------------------------------------------------------------------------
// Productos (paginado)
// ---------------------------------------------------------------------------
const PRODUCTS_QUERY = /* GraphQL */ `
  query SeybenProducts($cursor: String) {
    products(first: ${PAGE_SIZE}, after: $cursor, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      nodes {
        title
        description
        vendor
        productType
        tags
        handle
        status
        variants(first: 10) {
          nodes {
            title
            price
            sku
            availableForSale
            inventoryQuantity
          }
        }
      }
    }
  }
`;

type ProductsResp = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      title: string;
      description?: string;
      vendor?: string;
      productType?: string;
      tags?: string[];
      handle?: string;
      status?: string;
      variants: { nodes: ShopifyVariant[] };
    }[];
  };
};

// ---------------------------------------------------------------------------
// Paginas
// ---------------------------------------------------------------------------
const PAGES_QUERY = /* GraphQL */ `
  query SeybenPages($cursor: String) {
    pages(first: ${PAGE_SIZE}, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { title body handle }
    }
  }
`;

type PagesResp = {
  pages: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: { title: string; body: string; handle: string }[];
  };
};

// ---------------------------------------------------------------------------
// Colecciones (resumen)
// ---------------------------------------------------------------------------
const COLLECTIONS_QUERY = /* GraphQL */ `
  query SeybenCollections($cursor: String) {
    collections(first: ${PAGE_SIZE}, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { title description }
    }
  }
`;

type CollectionsResp = {
  collections: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: { title: string; description?: string }[];
  };
};

function fmtAddress(b?: Record<string, string | null>): string | undefined {
  if (!b) return undefined;
  const parts = [b.address1, b.address2, b.city, b.province, b.zip, b.country]
    .filter((p): p is string => !!p);
  return parts.length ? parts.join(", ") : undefined;
}

export async function fetchShopifyKnowledge(
  admin: AdminGql,
): Promise<ShopifyKnowledgePayload> {
  // 1. Shop info
  const shopData = await gql<ShopResp>(admin, SHOP_QUERY);
  const shop: ShopifyKnowledgePayload["shop"] = {
    name: shopData.shop.name,
    primaryDomain: shopData.shop.primaryDomain?.host,
    contactEmail: shopData.shop.contactEmail || undefined,
    address: fmtAddress(shopData.shop.billingAddress),
    currencyCode: shopData.shop.currencyCode,
  };

  // 1b. Politicas legales - query aparte porque requiere scope
  // read_legal_policies. Si el merchant no lo concedio (o falla por otra
  // razon), seguimos sin politicas en vez de tirar todo abajo.
  let policies: ShopifyPolicy[] = [];
  try {
    const polData = await gql<PoliciesResp>(admin, POLICIES_QUERY);
    policies = (polData.shop.shopPolicies || [])
      .filter((p) => p?.body && p.body.trim().length > 0)
      .map((p) => ({ title: p.title, body: p.body }));
  } catch (err) {
    console.warn("[seyben] policies fetch failed (likely scope missing):", String(err));
  }

  // 2. Productos (paginado hasta MAX_PRODUCTS)
  const products: ShopifyProduct[] = [];
  let cursor: string | null = null;
  while (products.length < MAX_PRODUCTS) {
    const r: ProductsResp = await gql<ProductsResp>(
      admin,
      PRODUCTS_QUERY,
      cursor ? { cursor } : undefined,
    );
    for (const p of r.products.nodes) {
      products.push({
        title: p.title,
        description: p.description,
        vendor: p.vendor,
        productType: p.productType,
        tags: p.tags,
        handle: p.handle,
        status: p.status,
        variants: p.variants?.nodes ?? [],
      });
      if (products.length >= MAX_PRODUCTS) break;
    }
    if (!r.products.pageInfo.hasNextPage) break;
    cursor = r.products.pageInfo.endCursor;
    if (!cursor) break;
  }

  // 3. Paginas
  const pages: ShopifyPage[] = [];
  cursor = null;
  while (pages.length < MAX_PAGES) {
    try {
      const r: PagesResp = await gql<PagesResp>(
        admin,
        PAGES_QUERY,
        cursor ? { cursor } : undefined,
      );
      for (const pg of r.pages.nodes) {
        pages.push({ title: pg.title, bodyHtml: pg.body, handle: pg.handle });
        if (pages.length >= MAX_PAGES) break;
      }
      if (!r.pages.pageInfo.hasNextPage) break;
      cursor = r.pages.pageInfo.endCursor;
      if (!cursor) break;
    } catch (err) {
      // Si read_content no esta concedido, lo dejamos vacio en vez de petar.
      console.warn("[seyben] pages fetch failed (likely scope missing):", String(err));
      break;
    }
  }

  // 4. Colecciones
  const collections: { title: string; description?: string }[] = [];
  cursor = null;
  while (collections.length < MAX_COLLECTIONS) {
    try {
      const r: CollectionsResp = await gql<CollectionsResp>(
        admin,
        COLLECTIONS_QUERY,
        cursor ? { cursor } : undefined,
      );
      for (const c of r.collections.nodes) {
        collections.push({ title: c.title, description: c.description });
        if (collections.length >= MAX_COLLECTIONS) break;
      }
      if (!r.collections.pageInfo.hasNextPage) break;
      cursor = r.collections.pageInfo.endCursor;
      if (!cursor) break;
    } catch (err) {
      console.warn("[seyben] collections fetch failed:", String(err));
      break;
    }
  }

  return { shop, products, pages, policies, collections };
}
