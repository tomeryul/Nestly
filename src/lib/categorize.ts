import { PRODUCT_CATALOG } from "./products";
import { callAi } from "./ai";

/**
 * Which shelf a product belongs on, fastest and cheapest first:
 *
 * 1. Known already (`knownCategory`): the home has added it before, or it's in
 *    the built-in catalogue — exactly, or as the start of a longer name ("חלב 3%"
 *    is milk). Instant, free, and covers almost everything after the first weeks.
 * 2. Only for a product never seen: the AI (`aiCategory`), in the background,
 *    after the item is already on the list. Names typed in quick succession go in
 *    one request; once saved, the answer is part of the home's history, so the
 *    same product never goes to the AI twice.
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

type Waiting = { name: string; resolve: (category: string | null) => void };
const queue: Waiting[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
const BATCH_WAIT = 450; // long enough to catch the next name typed, short enough not to be noticed
const BATCH_MAX = 20;

/** The AI's pick for a new product, or null if it couldn't answer (offline, no key, out of credit). */
export function aiCategory(homeId: string, name: string, categories: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    queue.push({ name, resolve });
    clearTimeout(timer);
    timer = setTimeout(() => flush(homeId, categories), queue.length >= BATCH_MAX ? 0 : BATCH_WAIT);
  });
}

async function flush(homeId: string, categories: string[]) {
  const batch = queue.splice(0, BATCH_MAX);
  if (queue.length) timer = setTimeout(() => flush(homeId, categories), 0);
  if (!batch.length) return;
  try {
    const r = await callAi<{ categories: (string | null)[] }>("categorize", homeId, { names: batch.map((b) => b.name), categories });
    batch.forEach((b, i) => b.resolve(r.categories?.[i] ?? null));
  } catch {
    batch.forEach((b) => b.resolve(null));
  }
}
