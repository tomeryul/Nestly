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

// Cached per isolate; warm invocations answer without re-downloading or re-indexing.
const cache = new Map<string, { at: number; index: Index }>();
let filesCache: { at: number; rows: FileRow[] } | null = null;

/**
 * WFileType=4 lists the daily *full* catalogue ("PriceFull…", ~5k items per
 * branch). The unfiltered listing is dominated by hourly delta files that carry
 * only a few hundred changed items — using those made most of a shopping list
 * look unavailable.
 */
async function listFiles(): Promise<FileRow[]> {
  if (filesCache && Date.now() - filesCache.at < TTL_MS) return filesCache.rows;
  const res = await fetch(`${BASE}/MainIO_Hok.aspx?WFileType=4`, { headers: { "User-Agent": UA } });
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

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
const decode = (s: string) =>
  s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(parseInt(e[1] === "x" || e[1] === "X" ? e.slice(2) : e.slice(1), e[1] === "x" || e[1] === "X" ? 16 : 10))
      : ENTITIES[e.toLowerCase()] ?? m
  );

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? decode(m[1]).trim() : "";
};

async function loadStore(storeId: string): Promise<Index> {
  const hit = cache.get(storeId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.index;

  const rows = await listFiles();
  // Newest full catalogue for this branch (the list is already newest-first).
  const mine = rows.filter((r) => r.TypeFile === "מחירים" && parseStore(r.Store).id === storeId);
  const row = mine.find((r) => r.FileNm.startsWith("PriceFull")) ?? mine[0];
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
  const index = buildIndex(items);
  cache.set(storeId, { at: Date.now(), index });
  return index;
}

/* ---------------- Hebrew-aware matching ----------------
 * Shoppers type generic plurals ("עגבניות") while the catalogue lists specific
 * singulars ("עגבניה"), so exact substring matching missed a lot. Normalise
 * punctuation and Hebrew final letters, stem plural/feminine endings, and weigh
 * each word by how rare it is so "קוטג" outranks the generic "גבינת".
 */
const FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };

function normalize(s: string) {
  return s
    .replace(/[׳'״"`,.\/\\*()\[\]{}+_%־–—-]/g, " ")
    .replace(/[ךםןףץ]/g, (m) => FINALS[m])
    .replace(/\s+/g, " ")
    .trim();
}

/** "מלפפונים"→"מלפפונ", "בננה"/"בננות"→"בננ" (no trailing-ת rule: it fuses "ביצת" with "ביצים"). */
function stemWord(w: string) {
  for (const suf of ["ימ", "ות", "ה"]) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) return w.slice(0, -suf.length);
  }
  return w;
}

const tokenize = (s: string) => normalize(s).split(" ").filter((w) => w.length > 1).map(stemWord);

type Entry = { item: Item; norm: string; words: string[] };
type Index = { entries: Entry[]; df: Map<string, number>; n: number };

function buildIndex(items: Item[]): Index {
  const entries = items.map((item) => ({ item, norm: normalize(item.name), words: tokenize(item.name) }));
  const df = new Map<string, number>();
  for (const e of entries) for (const w of new Set(e.words)) df.set(w, (df.get(w) ?? 0) + 1);
  return { entries, df, n: entries.length };
}

const related = (a: string, b: string) =>
  a === b || (a.length >= 3 && b.startsWith(a)) || (b.length >= 3 && a.startsWith(b));

function search(index: Index, q: string, limit = 12): Item[] {
  const qn = normalize(q);
  const terms = tokenize(q);
  if (!terms.length) return [];

  // Inverse document frequency: rare words carry the meaning.
  const weights = terms.map((t) => {
    let rarest = index.n;
    for (const [w, c] of index.df) if (c < rarest && related(t, w)) rarest = c;
    return Math.log(1 + index.n / Math.max(rarest, 1));
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;

  const scored: { item: Item; score: number; words: number }[] = [];
  for (const entry of index.entries) {
    let covered = 0;
    let exact = 0;
    let leads = false;
    for (let i = 0; i < terms.length; i++) {
      const at = entry.words.findIndex((w) => related(terms[i], w));
      if (at < 0) continue;
      covered += weights[i];
      if (entry.words[at] === terms[i]) exact++;
      if (i === 0 && at === 0) leads = true;
    }
    if (!covered) continue;

    const coverage = covered / total;
    let score = coverage * 140;
    if (entry.norm === qn) score += 120; // the product is exactly what was typed
    if (leads) score += 55 * (weights[0] / total); // leads with the query's word, weighted by how telling it is
    if (coverage > 0.999) score += 40; // every word accounted for
    score += exact * 15; // whole-word hits beat prefix hits
    score -= Math.min(entry.words.length * 3, 24); // prefer concise names
    scored.push({ item: entry.item, score, words: entry.words.length });
  }

  scored.sort((a, b) => b.score - a.score || a.words - b.words || a.item.price - b.item.price);
  return scored.slice(0, limit).map((s) => s.item);
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
      const index = await loadStore(store);
      const matches: Record<string, Item | null> = {};
      const options: Record<string, Item[]> = {};
      for (const n of names) {
        const hits = search(index, n, 4);
        matches[n] = hits[0] ?? null;
        options[n] = hits; // alternatives, so a wrong pick can be corrected in the UI
      }
      return json({ matches, options, count: index.n });
    }

    const store = url.searchParams.get("store");
    const q = url.searchParams.get("q") ?? "";
    if (!store) return json({ error: "missing store" }, 400);
    const index = await loadStore(store);
    return json({ results: search(index, q), count: index.n });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
