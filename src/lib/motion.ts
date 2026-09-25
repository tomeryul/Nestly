/**
 * Motion primitives shared by the gesture-driven surfaces (sheet, drawer).
 *
 * The rule these all serve: a gesture owns the element 1:1 while a finger is
 * down, and whatever takes over on release starts from where the finger left
 * it — never from zero. That is what makes an interrupted or reversed drag read
 * as one continuous movement instead of a restart.
 */
import { useEffect, useState } from "react";

/** Points-per-millisecond above which a release counts as a flick. */
export const FLICK = 0.11;

/**
 * Rubber-band resistance: past a natural edge the surface still moves, just
 * less and less the further you pull. Friction, not a wall. 0.55 is the
 * constant UIScrollView uses.
 */
export function rubberBand(offset: number, dimension: number, c = 0.55) {
  const x = Math.abs(offset);
  const damped = (x * dimension * c) / (dimension + c * x);
  return offset < 0 ? -damped : damped;
}

/**
 * Where a flick would coast to rest, at iOS's deceleration rate. Lets a fast,
 * short swipe finish the dismissal it clearly intended, instead of snapping
 * back because the finger did not travel far enough.
 */
const DECELERATION = 0.998;
export function project(velocity: number) {
  return (velocity * DECELERATION) / (1 - DECELERATION);
}

/** The element's *presented* offset, including a transition still in flight. */
export function presentedOffset(el: HTMLElement, axis: "x" | "y") {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  try {
    const m = new DOMMatrixReadOnly(t);
    return axis === "y" ? m.m42 : m.m41;
  } catch {
    return 0;
  }
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A short tick where the platform supports it. iOS Safari ignores vibrate, but
 * on Android it gives a drag the physical confirmation that a purely visual
 * response can't.
 */
export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported or blocked */
  }
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener("change", on);
    else mq.addListener(on); // Safari < 14
    return () => (mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on));
  }, [query]);
  return matches;
}

/** Someone who asked for less motion still gets the sheet — it just fades. */
export const useReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");
/** Above this the sheet is a centred dialog, and pulling it down means nothing. */
export const useWideViewport = () => useMediaQuery("(min-width: 600px)");
