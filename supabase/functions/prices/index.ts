/**
 * King Store price lookup.
 *
 * Israeli chains must publish their prices publicly (price transparency law).
 * King Store publishes via Bina Projects as gzipped XML per branch, with no
 * login. That host sends no CORS headers, so the browser cannot read it
 * directly — this function proxies, parses and caches it.
 *
 *   GET ?action=stores                     -> [{ id, name }]
 *   GET ?action=search&store=340&q=חלב     -> [{ name, price, unit, manufacturer }]
 */

const BASE = "https://kingstore.binaprojects.com";
const UA = "Mozilla/5.0 (compatible; NestlyPrices/1.0)";
const TTL_MS = 6 * 60 * 60 * 1000; // re-download a branch at most every 6h

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Item = { code: string; name: string; price: number; unit: string; manufacturer: string };
type FileRow = { FileNm: string; Store: string; TypeFile: string };

// Cached per isolate; warm invocations answer without re-downloading.
const cache = new Map<string, { at: number; items: Item[] }>();
let filesCache: { at: number; rows: FileRow[] } | null = null;

async function listFiles(): Promise<FileRow[]> {
  if (filesCache && Date.now() - filesCache.at < TTL_MS) return filesCache.rows;
  const res = await fetch(`${BASE}/MainIO_Hok.aspx`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`file list failed: ${res.status}`);
  const rows = (await res.json()) as FileRow[];
  filesCache = { at: Date.now(), rows };
  return rows;
}

/** "340 מיני קינג סחנין      " -> { id: "340", name: "מיני קינג סחנין" } */
function parseStore(raw: string) {
  const s = (raw ?? "").trim();
  const m = s.match(/^(\d+)\s*(.*)$/);
  return { id: m ? m[1] : s, name: (m ? m[2] : s).trim() };
}

async function stores() {
  const rows = await listFiles();
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (r.TypeFile !== "מחירים") continue;
    const { id, name } = parseStore(r.Store);
    if (id && !seen.has(id)) seen.set(id, name);
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
}

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1].trim() : "";
};

async function loadStore(storeId: string): Promise<Item[]> {
  const hit = cache.get(storeId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items;

  const rows = await listFiles();
  // Newest price file for this branch (the list is already newest-first).
  const row = rows.find((r) => r.TypeFile === "מחירים" && parseStore(r.Store).id === storeId);
  if (!row) throw new Error(`no price file for store ${storeId}`);

  const meta = await fetch(`${BASE}/Download.aspx?FileNm=${encodeURIComponent(row.FileNm)}`, { headers: { "User-Agent": UA } });
  if (!meta.ok) throw new Error(`download lookup failed: ${meta.status}`);
  const path = ((await meta.json()) as { SPath: string }[])[0]?.SPath;
  if (!path) throw new Error("no download path");

  const gz = await fetch(path, { headers: { "User-Agent": UA } });
  if (!gz.ok || !gz.body) throw new Error(`file download failed: ${gz.status}`);
  const xml = await new Response(gz.body.pipeThrough(new DecompressionStream("gzip"))).text();

  const items: Item[] = [];
  for (const chunk of xml.split("<Item>").slice(1)) {
    const name = tag(chunk, "ItemName");
    const price = parseFloat(tag(chunk, "ItemPrice"));
    if (!name || !isFinite(price)) continue;
    items.push({
      code: tag(chunk, "ItemCode"),
      name,
      price,
      unit: tag(chunk, "UnitOfMeasure") || tag(chunk, "UnitQty"),
      manufacturer: tag(chunk, "ManufactureName"),
    });
  }
  cache.set(storeId, { at: Date.now(), items });
  return items;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Rank matches. Israeli product names lead with the product ("חלב תנובה 3%"),
 * so a name whose *opening words* are the query beats one that merely starts
 * with the same letters ("חלבי טבעי") or mentions it later ("פירורי לחם").
 */
function rank(items: Item[], query: string, out: Map<string, { item: Item; score: number }>) {
  const terms = query.split(/\s+/).filter(Boolean);
  const whole = new RegExp(`(^|\\s)${esc(query)}(\\s|$)`);
  for (const item of items) {
    const name = item.name;
    if (!terms.every((t) => name.includes(t))) continue;
    let score: number;
    if (name === query) score = 200;
    else if (name.startsWith(query + " ")) score = 150; // query is the leading word(s)
    else if (whole.test(name)) score = 100; // appears as its own word later on
    else if (name.startsWith(query)) score = 55; // only a prefix of a longer word
    else score = 30;
    score -= Math.min(name.split(/\s+/).length * 2, 12); // prefer concise names
    const key = item.code || name;
    const prev = out.get(key);
    if (!prev || score > prev.score) out.set(key, { item, score });
  }
}

function search(items: Item[], q: string, limit = 12) {
  const query = q.trim();
  if (!query) return [];
  // Score the plural as typed and its singular together ("בננות" must be able to
  // reach the plain "בננה" rather than settling for a dessert that mentions it).
  const variants = [query];
  const stem = query.replace(/(ות|ים)$/, "");
  if (stem.length >= 3 && stem !== query) {
    // "מלפפונים" -> stem "מלפפונ" -> "מלפפון" (Hebrew final letter form)
    const FINAL: Record<string, string> = { "כ": "ך", "מ": "ם", "נ": "ן", "פ": "ף", "צ": "ץ" };
    const last = stem[stem.length - 1];
    variants.push(stem, stem + "ה");
    if (FINAL[last]) variants.push(stem.slice(0, -1) + FINAL[last]);
  }

  const scored = new Map<string, { item: Item; score: number }>();
  for (const v of variants) rank(items, v, scored);
  return [...scored.values()]
    .sort((a, b) => b.score - a.score || a.item.price - b.item.price)
    .slice(0, limit)
    .map((s) => s.item);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "search";
    if (action === "stores") return json({ stores: await stores() });

    // Batch: price a whole shopping list in ONE request (the file is loaded once).
    if (action === "match") {
      const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
      const store = body.store ?? url.searchParams.get("store");
      const names: string[] = body.names ?? (url.searchParams.get("names") ?? "").split("|").filter(Boolean);
      if (!store) return json({ error: "missing store" }, 400);
      const items = await loadStore(store);
      const matches: Record<string, Item | null> = {};
      for (const n of names) matches[n] = search(items, n, 1)[0] ?? null;
      return json({ matches, count: items.length });
    }

    const store = url.searchParams.get("store");
    const q = url.searchParams.get("q") ?? "";
    if (!store) return json({ error: "missing store" }, 400);
    const items = await loadStore(store);
    return json({ results: search(items, q), count: items.length });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
