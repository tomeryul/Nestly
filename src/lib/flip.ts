import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

// Mirrors --ease-in-out and --ease-out in index.css (WAAPI can't read var()).
const MOVE = { duration: 300, easing: "cubic-bezier(0.77, 0, 0.175, 1)" }; // moving on screen
const ENTER = { duration: 250, easing: "cubic-bezier(0.23, 1, 0.32, 1)" };

/**
 * FLIP for a list whose rows change order or section. Call the returned
 * `capture()` right before the state change that moves rows; on the next commit
 * every `[data-flip="key"]` element inside the container glides from where it
 * was to where it now is, and a key that wasn't there before fades in.
 *
 * Positions are captured as they are *presented* — including a glide still in
 * flight — so a second change mid-move retargets from where the eye is, not
 * from a jump. Nothing animates unless `capture()` was called, so background
 * refreshes from the server leave the list alone.
 */
export function useFlip(containerRef: RefObject<HTMLElement>) {
  const first = useRef<Map<string, DOMRect> | null>(null);

  const capture = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const map = new Map<string, DOMRect>();
    root.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => map.set(el.dataset.flip!, el.getBoundingClientRect()));
    first.current = map;
  }, [containerRef]);

  useLayoutEffect(() => {
    const before = first.current;
    if (!before) return;
    first.current = null;
    const root = containerRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = [...root.querySelectorAll<HTMLElement>("[data-flip]")];
    // Cancel every glide first and only then measure, so layout is read once.
    for (const el of els) el.getAnimations().forEach((a) => a.id === "flip" && a.cancel());
    const now = els.map((el) => el.getBoundingClientRect());
    els.forEach((el, i) => {
      const was = before.get(el.dataset.flip!);
      if (!was) {
        el.animate([{ opacity: 0, transform: "scale(0.97)" }, { opacity: 1, transform: "none" }], ENTER).id = "flip";
        return;
      }
      const dx = was.left - now[i].left;
      const dy = was.top - now[i].top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], MOVE).id = "flip";
    });
  });

  return capture;
}
