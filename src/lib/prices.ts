import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Client for the `prices` edge function, which proxies King Store's public
 * price files (the chain publishes them by law; the host has no CORS headers,
 * so the lookup has to go through our function).
 */

export type PriceItem = { code: string; name: string; price: number; unit: string; manufacturer: string };
export type PriceStore = { id: string; name: string };

const ENDPOINT = `${SUPABASE_URL}/functions/v1/prices`;
const STORE_KEY = "nestly.priceStore";

export const getStoreId = () => localStorage.getItem(STORE_KEY);
export const setStoreId = (id: string) => localStorage.setItem(STORE_KEY, id);
export const getStoreName = () => localStorage.getItem(STORE_KEY + ".name") ?? "";
export const setStoreName = (n: string) => localStorage.setItem(STORE_KEY + ".name", n);

async function call(params: Record<string, string>, post?: unknown) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${ENDPOINT}?${qs}`, {
    method: post ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
      ...(post ? { "Content-Type": "application/json" } : {}),
    },
    body: post ? JSON.stringify(post) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export async function fetchStores(): Promise<PriceStore[]> {
  const { stores } = await call({ action: "stores" });
  return stores ?? [];
}

export async function searchPrice(storeId: string, q: string): Promise<PriceItem[]> {
  const { results } = await call({ action: "search", store: storeId, q });
  return results ?? [];
}

/**
 * Price a whole list in ONE request. Doing a request per item meant the branch
 * file was re-fetched each time (~3s each), so a long list appeared to hang.
 */
export async function priceMany(storeId: string, names: string[]): Promise<Record<string, PriceItem | null>> {
  if (names.length === 0) return {};
  const { matches } = await call({ action: "match" }, { store: storeId, names });
  return matches ?? {};
}
