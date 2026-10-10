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
 *
 * A capture is spent on the first commit (within a moment) that actually moves
 * something: a list fed through useDragReorder re-orders one render after its
 * items change, and the glide has to wait for that render, not the one before.
 */
export function useFlip(containerRef: RefObject<HTMLElement>) {
  const first = useRef<{ rects: Map<string, DOMRect>; at: number } | null>(null);

  const capture = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const map = new Map<string, DOMRect>();
    root.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => map.set(el.dataset.flip!, el.getBoundingClientRect()));
    first.current = { rects: map, at: performance.now() };
  }, [containerRef]);

  useLayoutEffect(() => {
    const capture = first.current;
    if (!capture) return;
    const root = containerRef.current;
    if (!root || performance.now() - capture.at > 250 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      first.current = null;
      return;
    }
    const before = capture.rects;
    const els = [...root.querySelectorAll<HTMLElement>("[data-flip]")];
    // Cancel every glide first and only then measure, so layout is read once.
    const running = els.flatMap((el) => el.getAnimations().filter((a) => a.id === "flip"));
    const at = running.map((a) => a.currentTime);
    running.forEach((a) => a.cancel());
    const now = els.map((el) => el.getBoundingClientRect());
    const plays: (() => void)[] = [];
    els.forEach((el, i) => {
      const was = before.get(el.dataset.flip!);
      if (!was) {
        plays.push(() => (el.animate([{ opacity: 0, transform: "scale(0.97)" }, { opacity: 1, transform: "none" }], ENTER).id = "flip"));
        return;
      }
      const dx = was.left - now[i].left;
      const dy = was.top - now[i].top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      plays.push(() => (el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], MOVE).id = "flip"));
    });
    const gone = before.size > els.length;
    if (!plays.length && !gone) {
      // Nothing moved yet: put any glide back exactly where it was and keep waiting.
      running.forEach((a, i) => {
        a.currentTime = at[i];
        a.play();
      });
      return;
    }
    first.current = null;
    plays.forEach((play) => play());
  });

  return capture;
}
