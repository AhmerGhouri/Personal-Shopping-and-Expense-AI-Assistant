import { ApiError } from './assistant.ts';

export interface Product {
  id: string;
  title: string;
  price: string;
  priceValue?: number;
  store: string;
  link: string;
  thumbnail?: string;
  rating?: number;
  reviews?: number;
  delivery?: string;
}

export type SearchProducts = (query: string, options?: { minPrice?: number; maxPrice?: number }) => Promise<Product[]>;

export const SERPAPI_URL = 'https://serpapi.com/search.json';
const MAX_RESULTS = 6;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const compact = (product: Product): Product =>
  Object.fromEntries(Object.entries(product).filter(([, value]) => value !== undefined)) as unknown as Product;
const httpsUrl = (value: unknown) => {
  const url = text(value, 2000);
  return url && /^https:\/\//i.test(url) ? url : undefined;
};

/**
 * Picks the product source for the configured country. Google Shopping (via SerpApi) does not
 * support Pakistan, so Pakistani searches use Daraz.pk, the country's largest marketplace.
 */
export function createProductSearch(env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch): SearchProducts | undefined {
  const country = (env.SHOPPING_COUNTRY?.trim() || 'us').toLowerCase();
  if (country === 'pk') return createDarazSearch(request);
  return createGoogleShoppingSearch(env, country, request);
}

export const DARAZ_URL = 'https://www.daraz.pk/catalog/';

const numeric = (value: unknown) => {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : number(value);
  return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
};

/** Daraz.pk listings from its public catalogue search (the same JSON its website loads). */
export function createDarazSearch(request: typeof fetch = fetch): SearchProducts {
  return async function searchProducts(query, options = {}) {
    // Daraz matches listing titles, so prices and filler words in the query only hurt results.
    const cleaned = query.replace(/\b(rs\.?|pkr|rupees?|under|below|budget|price|for|best|buy|\d{4,}|\d+k)(?=\s|$)/gi, ' ').replace(/\s+/g, ' ').trim() || query;
    const params = new URLSearchParams({ ajax: 'true', q: cleaned.slice(0, 200), page: '1' });
    if (options.minPrice || options.maxPrice) params.set('price', `${options.minPrice ?? ''}-${options.maxPrice ?? ''}`);
    let body: unknown;
    try {
      const response = await request(`${DARAZ_URL}?${params}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36' },
        signal: AbortSignal.timeout(20000),
      });
      body = await response.json().catch(() => undefined);
      if (!response.ok || !isObject(body)) {
        console.error(`[Daraz] status=${response.status}`);
        throw new ApiError(502, 'Daraz search is not responding right now. Please try again in a minute.');
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, 'Could not reach Daraz. Check the computer’s internet connection.');
    }
    const items = isObject(body.mods) && Array.isArray(body.mods.listItems) ? body.mods.listItems : [];
    const products: Product[] = [];
    for (const item of items) {
      if (!isObject(item) || item.inStock === false) continue;
      const title = text(item.name, 200);
      const priceValue = numeric(item.price);
      const rawLink = text(item.itemUrl, 2000);
      const link = rawLink ? httpsUrl(rawLink.startsWith('//') ? `https:${rawLink}` : rawLink) : undefined;
      if (!title || priceValue === undefined || !link) continue;
      if (options.maxPrice && priceValue > options.maxPrice) continue;
      if (options.minPrice && priceValue < options.minPrice) continue;
      const seller = text(item.sellerName, 40);
      const location = text(item.location, 30);
      products.push(compact({
        id: `p${products.length + 1}`, title, priceValue, link,
        price: text(item.priceShow, 40) ?? `Rs. ${priceValue.toLocaleString('en-PK')}`,
        store: seller ? `Daraz · ${seller}` : 'Daraz',
        thumbnail: httpsUrl(item.image),
        rating: numeric(item.ratingScore) || undefined,
        reviews: numeric(item.review) || undefined,
        delivery: location ? `Ships from ${location}` : undefined,
      }));
      if (products.length === MAX_RESULTS) break;
    }
    return products;
  };
}

/** Real shopping results (prices, stores, links) from Google Shopping via SerpApi. */
export function createGoogleShoppingSearch(env: NodeJS.ProcessEnv, country: string, request: typeof fetch = fetch): SearchProducts | undefined {
  const key = env.SERPAPI_KEY?.trim();
  if (!key) return undefined;
  const language = env.SHOPPING_LANGUAGE?.trim() || 'en';

  return async function searchProducts(query, options = {}) {
    const params = new URLSearchParams({ engine: 'google_shopping', q: query.slice(0, 200), gl: country, hl: language, api_key: key });
    let body: unknown;
    try {
      const response = await request(`${SERPAPI_URL}?${params}`, { signal: AbortSignal.timeout(20000) });
      body = await response.json().catch(() => undefined);
      if (!response.ok) {
        console.error(`[SerpApi] status=${response.status}`);
        throw new ApiError(502, response.status === 401
          ? 'Product search rejected the SERPAPI_KEY. Check it in backend/.env.'
          : response.status === 429 ? 'Product search limit reached for this month.' : 'Product search failed. Please try again.');
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, 'Could not reach the product search service. Check the computer’s internet connection.');
    }
    const results = isObject(body) && Array.isArray(body.shopping_results) ? body.shopping_results : [];
    const products: Product[] = [];
    for (const item of results) {
      if (!isObject(item)) continue;
      const title = text(item.title, 200);
      const price = text(item.price, 40);
      const link = httpsUrl(item.link) ?? httpsUrl(item.product_link);
      if (!title || !price || !link) continue;
      const priceValue = number(item.extracted_price);
      if (options.maxPrice && priceValue && priceValue > options.maxPrice) continue;
      if (options.minPrice && priceValue && priceValue < options.minPrice) continue;
      products.push(compact({
        id: `p${products.length + 1}`, title, price, priceValue, link,
        store: text(item.source, 60) ?? 'Online store',
        thumbnail: httpsUrl(item.thumbnail),
        rating: number(item.rating), reviews: number(item.reviews),
        delivery: text(item.delivery, 80),
      }));
      if (products.length === MAX_RESULTS) break;
    }
    return products;
  };
}

/** Products echoed back by the app so the assistant can discuss or buy what is on screen. */
export function validateProducts(value: unknown): Product[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 12) throw new ApiError(400, 'products must be a list of at most 12 items.');
  return value.map(item => {
    if (!isObject(item)) throw new ApiError(400, 'Invalid product.');
    const id = text(item.id, 20), title = text(item.title, 200), price = text(item.price, 40);
    const store = text(item.store, 60), link = httpsUrl(item.link);
    if (!id || !title || !price || !store || !link) throw new ApiError(400, 'Invalid product.');
    return compact({
      id, title, price, store, link,
      priceValue: number(item.priceValue), thumbnail: httpsUrl(item.thumbnail),
      rating: number(item.rating), reviews: number(item.reviews), delivery: text(item.delivery, 80),
    });
  });
}

/** Compact text the model sees; links are omitted so it never reads URLs aloud. */
export function describeProducts(products: Product[]): string {
  return products.map(product => [
    `Card ${product.id.slice(1)} (id ${product.id}): ${product.title}`, `price ${product.price}`, `store ${product.store}`,
    product.rating ? `rating ${product.rating}/5${product.reviews ? ` (${product.reviews} reviews)` : ''}` : undefined,
    product.delivery,
  ].filter(Boolean).join(' | ')).join('\n');
}
