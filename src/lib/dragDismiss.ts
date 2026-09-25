import { useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { FLICK, clamp, haptic, presentedOffset, project, rubberBand } from "./motion";

type Axis = "x" | "y";

/**
 * Drag a panel off the edge it came in through.
 *
 * The four details that separate this from a bad drag, all of them here:
 * pointer capture so the gesture survives leaving the element; a guard against
 * a second finger, which otherwise makes the panel jump; rubber-band damping
 * when pulled the wrong way; and a release that looks at velocity, not only at
 * distance, so a short flick still dismisses.
 *
 * `direction` is which way along the axis dismissal lies: +1 for a sheet that
 * leaves downwards, -1 for a drawer that leaves through the inline-start edge.
 */
export function useDragDismiss({
  axis,
  direction,
  onDismiss,
  onProgress,
  enabled = true,
}: {
  axis: Axis;
  direction: 1 | -1;
  /** Called with the release velocity (px/ms, always positive) once committed. */
  onDismiss: (velocity: number) => void;
  /** 0 at rest, 1 when dragged a full panel-length toward dismissal. */
  onProgress?: (p: number) => void;
  enabled?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const drag = useRef<{
    id: number;
    handle: HTMLElement;
    from: number;
    base: number;
    last: number;
    lastT: number;
    v: number;
    offset: number;
    moved: boolean;
    /** Window-level safety net: capture is only taken once it is a drag, so a
     *  release that lands somewhere else never reaches the handle's handler. */
    abort: (e: PointerEvent) => void;
  } | null>(null);

  const axisPos = (e: { clientX: number; clientY: number }) => (axis === "y" ? e.clientY : e.clientX);
  const size = (el: HTMLElement) => (axis === "y" ? el.offsetHeight : el.offsetWidth);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      // A second finger arriving mid-drag must be ignored, not adopted.
      if (!enabled || drag.current) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const el = ref.current;
      if (!el) return;
      // Take over from wherever the panel currently *appears* to be, so grabbing
      // it mid-animation continues that movement rather than teleporting.
      const base = presentedOffset(el, axis) * direction;
      delete el.dataset.settling;
      el.style.transitionDuration = "";
      const abort = (ev: PointerEvent) => endDragRef.current(ev.pointerId);
      drag.current = {
        id: e.pointerId,
        handle: e.currentTarget as HTMLElement,
        from: axisPos(e),
        base,
        last: axisPos(e),
        lastT: performance.now(),
        v: 0,
        offset: base,
        moved: false,
        abort,
      };
      // Capture is deliberately NOT taken here. A captured pointer redirects the
      // click to the capturing element, which would swallow every tap on the
      // buttons inside the handle. It is taken in onPointerMove, once this is a
      // drag — which is also why the release has to be watched on the window.
      window.addEventListener("pointerup", abort);
      window.addEventListener("pointercancel", abort);
    },
    [axis, direction, enabled]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const d = drag.current;
      const el = ref.current;
      if (!d || !el || e.pointerId !== d.id) return;
      const pos = axisPos(e);
      const along = d.base + (pos - d.from) * direction;
      if (!d.moved) {
        if (Math.abs(along - d.base) < 3) return; // let a tap stay a tap
        d.moved = true;
        el.dataset.dragging = "true";
        // Now that it is a drag, hold on to the pointer so it survives leaving
        // the handle's bounds.
        try {
          d.handle.setPointerCapture(d.id);
        } catch {
          /* older browsers */
        }
      }
      const now = performance.now();
      const dt = now - d.lastT;
      if (dt > 0) d.v = ((pos - d.last) * direction) / dt;
      d.last = pos;
      d.lastT = now;
      // Pulled the wrong way it still moves, just less the further it goes.
      d.offset = along >= 0 ? along : rubberBand(along, size(el));
      el.style.transform = `translate${axis.toUpperCase()}(${d.offset * direction}px)`;
      onProgress?.(clamp(d.offset / size(el), 0, 1));
    },
    [axis, direction, onProgress]
  );

  const endDrag = useCallback(
    (pointerId: number) => {
      const d = drag.current;
      const el = ref.current;
      if (!d || pointerId !== d.id) return;
      drag.current = null;
      window.removeEventListener("pointerup", d.abort);
      window.removeEventListener("pointercancel", d.abort);
      if (!el) return;
      delete el.dataset.dragging;
      if (!d.moved) return;

      const span = size(el);
      // Velocity from the last move only counts if the finger was still moving
      // when it left. Pull the panel down, hold, let go — that is a considered
      // "no", and it must not fly away on a reading taken 400ms ago.
      const v = performance.now() - d.lastT > 90 ? 0 : d.v;
      // Distance OR a flick OR a coast that would clearly carry it off-screen.
      if (d.offset > span * 0.25 || v > FLICK || d.offset + project(v) > span * 0.5) {
        haptic(8);
        onDismiss(Math.max(v, 0));
        return;
      }
      // Short of the threshold: settle back on a spring, which carries the
      // velocity the finger left behind instead of starting again from rest.
      el.dataset.settling = "true";
      el.style.transform = "";
      onProgress?.(0);
      // Only this element's own transform ends the settle — a button inside it
      // finishing its press transition must not. And if it was already at rest
      // nothing transitions at all, so the timer is what cleans up.
      const done = (ev?: TransitionEvent) => {
        if (ev && (ev.target !== el || ev.propertyName !== "transform")) return;
        clearTimeout(timer);
        delete el.dataset.settling;
        el.removeEventListener("transitionend", done);
      };
      const timer = setTimeout(done, 600);
      el.addEventListener("transitionend", done);
    },
    [onDismiss, onProgress]
  );
  const endDragRef = useRef(endDrag);
  endDragRef.current = endDrag;

  const onPointerUp = useCallback((e: ReactPointerEvent) => endDrag(e.pointerId), [endDrag]);

  return {
    /** Attach to the element that moves. */
    ref,
    /** Attach to whatever part of it the finger may grab. */
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
