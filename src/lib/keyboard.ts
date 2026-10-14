import { useEffect, type RefObject } from "react";

/**
 * Keyboard avoidance for sheets, the way iOS does it: when the software
 * keyboard comes up, the sheet rides up on top of it instead of staying
 * behind it.
 *
 * iOS (in Safari and as a home-screen app) doesn't shrink the page for the
 * keyboard. It shrinks only the *visual* viewport and leaves fixed elements
 * where they were, under the keyboard. The difference between the page and
 * what's visible is the keyboard. Android (with interactive-widget=
 * resizes-content in the viewport tag) resizes the page itself, so there the
 * difference is 0 and this does nothing.
 *
 * Writes two variables on the element: --kb (keyboard height) and --vvh (the
 * visible height), plus data-kb while a keyboard is up. The stylesheet does
 * the rest.
 */
const MIN_KEYBOARD = 100; // anything smaller is browser chrome, not a keyboard
let lastKeyboard = 0; // its height last time, so the sheet can move with it, not after it

const isTextField = (t: EventTarget | null) =>
  t instanceof HTMLTextAreaElement ||
  (t instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "range", "color", "file"].includes(t.type)) ||
  (t instanceof HTMLElement && t.isContentEditable);

export function useKeyboardInset(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!active || !vv || !el) return;
    let reveal = 0;
    let recheck = 0;

    const apply = (kb: number, visible: number) => {
      el.style.setProperty("--kb", `${kb}px`);
      el.style.setProperty("--vvh", `${visible}px`);
      if (kb > 0) el.dataset.kb = "open";
      else delete el.dataset.kb;
      // Once the sheet has settled, keep whatever is being typed into in view.
      clearTimeout(reveal);
      reveal = window.setTimeout(() => {
        const a = document.activeElement;
        if (kb > 0 && a instanceof HTMLElement && el.contains(a)) a.scrollIntoView({ block: "nearest" });
      }, 320);
    };

    const measure = () => {
      if (vv.scale > 1.01) return; // pinch-zoomed: the visual viewport is smaller, but not because of a keyboard
      const page = document.documentElement.clientHeight;
      const kb = Math.round(page - vv.height - vv.offsetTop);
      if (kb >= MIN_KEYBOARD) {
        lastKeyboard = kb;
        apply(kb, vv.height);
      } else apply(0, vv.height);
    };

    // The visual viewport only reports the keyboard once it's (nearly) up. Having seen it
    // before, start moving as the field takes focus, so the sheet and the keyboard rise
    // together, then check: with a hardware keyboard nothing comes up, and it drops back.
    const onFocusIn = (e: FocusEvent) => {
      if (!lastKeyboard || el.dataset.kb || !isTextField(e.target)) return;
      apply(lastKeyboard, document.documentElement.clientHeight - lastKeyboard);
      clearTimeout(recheck);
      recheck = window.setTimeout(measure, 650);
    };

    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    el.addEventListener("focusin", onFocusIn);
    measure();
    return () => {
      clearTimeout(reveal);
      clearTimeout(recheck);
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
      el.removeEventListener("focusin", onFocusIn);
    };
  }, [ref, active]);
}

/**
 * A mouse or trackpad is the main pointer. Fields focus themselves on open only
 * then: on a phone that would throw the keyboard over a sheet the person may
 * not even want to type into.
 */
export const hasFinePointer = () => typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
