import { useLayoutEffect, useRef, type DependencyList, type RefObject } from "react";

/**
 * One selection lens for a tab bar. Instead of each tab painting its own
 * selected background (which makes the selection jump), a single element
 * slides to whichever tab carries `.active` — on a spring, with a liquid
 * stretch in the direction of travel, the way the native Liquid Glass tab bar
 * moves its selection.
 */
export function useTabLens(gridRef: RefObject<HTMLElement>, lensRef: RefObject<HTMLElement>, deps: DependencyList) {
  const placed = useRef(false);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const lens = lensRef.current;
    if (!grid || !lens) return;
    const place = (animate: boolean) => {
      const active = grid.querySelector<HTMLElement>(".active");
      if (!active) {
        lens.style.opacity = "0";
        return;
      }
      const from = lens.getBoundingClientRect().left;
      lens.style.transition = animate ? "" : "none";
      lens.style.opacity = "1";
      lens.style.width = `${active.offsetWidth}px`;
      lens.style.transform = `translateX(${active.offsetLeft}px)`;
      if (!animate) {
        void lens.offsetWidth; // commit the jump before transitions come back
        lens.style.transition = "";
        return;
      }
      const moved = Math.abs(active.getBoundingClientRect().left - from) > 2;
      if (moved && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        lens.animate([{ scale: "1 1" }, { scale: "1.22 0.9", offset: 0.35 }, { scale: "1 1" }], {
          duration: 460,
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        });
      }
    };
    // First placement (page load) appears in place; every later one travels.
    place(placed.current);
    placed.current = true;
    const onResize = () => place(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
