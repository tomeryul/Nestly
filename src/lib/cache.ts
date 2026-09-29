import { useEffect, useRef } from "react";

/**
 * A small on-device copy of what the app last showed.
 *
 * The database is a network round-trip away, so every cold start used to open
 * on a spinner. With this, a screen paints immediately from what it showed
 * last time and the fresh copy replaces it silently when it arrives
 * (stale-while-revalidate). Keys are scoped by home or list so homes never
 * leak into each other, and everything is wiped on sign-out.
 */
const PREFIX = "nestly.cache.v1.";

export function readCache<T>(key: string | null | undefined): T | undefined {
  if (!key) return undefined;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function writeCache(key: string | null | undefined, value: unknown) {
  if (!key) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the cache is only an optimisation */
  }
}

export function clearCache() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Run `refresh` when the app comes back to the foreground after being away for
 * a while — quietly, with no spinner — so data changed on another phone shows
 * up without re-mounting (and re-loading) the whole screen. A quick hop to
 * another app and back doesn't trigger it.
 */
export function useOnResume(refresh: () => void, minAwayMs = 15000) {
  const cb = useRef(refresh);
  cb.current = refresh;
  useEffect(() => {
    let hiddenAt = 0;
    const onChange = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= minAwayMs) cb.current();
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [minAwayMs]);
}
