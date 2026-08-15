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

async function call(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${ENDPOINT}?${qs}`, {
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
  });
  const body = await res.json();
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

/** Look up the cheapest sensible match for each name, sequentially (the function caches per branch). */
export async function priceMany(storeId: string, names: string[]): Promise<Record<string, PriceItem | null>> {
  const out: Record<string, PriceItem | null> = {};
  for (const n of names) {
    try {
      const r = await searchPrice(storeId, n);
      out[n] = r[0] ?? null;
    } catch {
      out[n] = null;
    }
  }
  return out;
}
