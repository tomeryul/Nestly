import { PRODUCT_CATALOG } from "./products";
import { callAi } from "./ai";

/**
 * Which shelf a product belongs on, fastest and cheapest first:
 *
 * 1. Known already (`knownCategory`): the home has added it before, or it's in
 *    the built-in catalogue — exactly, or as the start of a longer name ("חלב 3%"
 *    is milk). Instant, free, and covers almost everything after the first weeks.
 * 2. Only for a product never seen: the AI (`aiCategory`), in the background,
 *    after the item is already on the list. Nothing waits on the answer, so new
 *    products are collected and sorted together; once saved, the answer is part
 *    of the home's history, so the same product never goes to the AI twice.
 */
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function knownCategory(name: string, history: { name: string; category: string | null }[], allowed: string[]): string | null {
  const n = norm(name);
  const ok = (c: string | null | undefined) => (c && allowed.includes(c) ? c : null);
  const exact = history.find((h) => norm(h.name) === n && ok(h.category)) ?? PRODUCT_CATALOG.find((p) => norm(p.name) === n && ok(p.category));
  if (exact) return exact.category;
  // The longest known name this one starts with, as a whole word.
  let best: { len: number; category: string } | null = null;
  for (const p of [...history, ...PRODUCT_CATALOG]) {
    const known = norm(p.name);
    const category = ok(p.category);
    if (category && known.length >= 2 && n.startsWith(known + " ") && known.length > (best?.len ?? 0)) best = { len: known.length, category };
  }
  return best?.category ?? null;
}

// Most of a request is the same every time (the instructions and the category
// list, ~800 tokens), so one request for a whole shop's new products instead of
// one per product is most of the cost saved. They go when nothing new has come
// for a while, when a full request's worth is waiting, or when the app goes to
// the background (whoever was adding is done).
type Waiting = { name: string; resolve: (category: string | null) => void; onSending?: () => void };
const queue: Waiting[] = [];
let target: { homeId: string; categories: string[] } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const QUIET = 300_000; // five minutes after the last new product
const BATCH_MAX = 20; // names per request, as the server takes them

/**
 * The AI's pick for a new product, in a while. Null when there was no answer
 * (offline, no key, out of credit): the item stays without a category, and the
 * shopping list asks again the next time it's opened.
 */
export function aiCategory(homeId: string, name: string, categories: string[], onSending?: () => void): Promise<string | null> {
  return new Promise((resolve) => {
    target = { homeId, categories };
    queue.push({ name, resolve, onSending });
    clearTimeout(timer);
    if (new Set(queue.map((w) => norm(w.name))).size >= BATCH_MAX) void flush();
    else timer = setTimeout(flush, QUIET);
  });
}

async function flush() {
  clearTimeout(timer);
  const batch = queue.splice(0);
  if (!batch.length || !target) return;
  const { homeId, categories } = target;
  // One name per product, however many times it was asked for meanwhile.
  const names = [...new Map(batch.map((b) => [norm(b.name), b.name])).values()];
  batch.forEach((b) => b.onSending?.());
  for (let i = 0; i < names.length; i += BATCH_MAX) {
    const chunk = names.slice(i, i + BATCH_MAX);
    let picked: (string | null)[] = [];
    try {
      picked = (await callAi<{ categories: (string | null)[] }>("categorize", homeId, { names: chunk, categories })).categories ?? [];
    } catch {
      // No answer: everything in this chunk resolves to null below.
    }
    const byName = new Map(chunk.map((n, j) => [norm(n), picked[j] ?? null]));
    for (const b of batch) if (byName.has(norm(b.name))) b.resolve(byName.get(norm(b.name)) ?? null);
  }
}

if (typeof document !== "undefined")
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });
