import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDragDismiss } from "../lib/dragDismiss";
import { clamp, presentedOffset, useReducedMotion, useWideViewport } from "../lib/motion";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-5 w-5 animate-spin rounded-full border-2 border-t-transparent ${className}`}
      style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }}
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

/**
 * Accordion body.
 *
 * The one place a height animation is worth its cost: there is no transform
 * that opens a section. `grid-template-rows: 0fr -> 1fr` gets it without
 * measuring anything in JS. The clip is only on while the height is actually
 * moving, so a row lifted out of the list for dragging isn't cut off the rest
 * of the time.
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [moving, setMoving] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false; // no animation for whatever state the page loads in
      return;
    }
    setMoving(true);
    const t = setTimeout(() => setMoving(false), 220);
    return () => clearTimeout(t);
  }, [open]);
  return (
    <div className="nst-collapse" data-open={open} data-moving={moving}>
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="empty-state">
      {icon && <div className="icon">{icon}</div>}
      <p style={{ color: "var(--text-3)", fontWeight: 600 }}>{title}</p>
      {hint && <p style={{ fontSize: 13 }}>{hint}</p>}
    </div>
  );
}

/**
 * Bottom sheet (a centred dialog from 600px up).
 *
 * It leaves through the edge it arrived from, and it can be pulled down and
 * thrown away — the grabber says so before anyone tries. The exit has to play
 * before the element is removed, so the component keeps its own presence state
 * rather than unmounting the moment `open` flips.
 */
export function Modal({
  open,
  onClose,
  title,
  done,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /**
   * The sheet's primary action (Create / Save / Add). It sits on the trailing
   * edge of the sheet's top bar, opposite Close — where iOS puts Done — so the
   * action is always in reach without scrolling to the end of the form.
   * Management sheets that save as you go leave it out and keep Close only.
   */
  done?: { label: string; onClick: () => void; disabled?: boolean };
  children: ReactNode;
}) {
  const [present, setPresent] = useState(open);
  const [shown, setShown] = useState(false);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const closing = useRef(false);
  const leaveRef = useRef<(velocity: number) => void>(() => {});
  const reduce = useReducedMotion();
  const wide = useWideViewport();

  // Pulling a centred dialog downwards means nothing, and someone who asked for
  // less motion should not have to drag anything to get out.
  const draggable = !wide && !reduce;

  const sheet = useDragDismiss({
    axis: "y",
    direction: 1,
    enabled: draggable,
    onDismiss: (v) => leaveRef.current(v),
    onProgress: (p) => {
      // Scrim and sheet are one surface, so the scrim follows the finger too —
      // which means it must not be running its own transition while it does.
      const b = backdropRef.current;
      if (!b) return;
      b.style.transition = p > 0 ? "none" : "";
      b.style.opacity = p > 0 ? String(1 - p * 0.75) : "";
    },
  });

  const leave = useCallback(
    (velocity = 0) => {
      if (closing.current) return;
      closing.current = true;
      const el = sheet.ref.current;
      if (el) {
        if (velocity > 0) {
          // Velocity handoff: a hard flick finishes fast, a gentle one doesn't.
          const remaining = Math.max(el.offsetHeight - presentedOffset(el, "y"), 0);
          el.style.transitionDuration = `${clamp(remaining / velocity, 160, 380)}ms`;
        }
        el.style.transform = ""; // hand the exit back to the stylesheet
      }
      const b = backdropRef.current;
      if (b) {
        // Fade out from wherever the drag left it rather than snapping to full.
        b.style.transition = "";
        b.style.opacity = "0";
      }
      setShown(false);
      onClose();
    },
    [onClose, sheet.ref],
  );
  leaveRef.current = leave;

  useEffect(() => {
    if (open) {
      closing.current = false;
      setPresent(true);
      const b = backdropRef.current;
      if (b) {
        b.style.transition = "";
        b.style.opacity = "";
      }
      // One frame at the closed position first, or there is nothing to animate
      // from and the sheet simply appears. Both frames have to be cancellable:
      // closing inside that window must not let a stale open land.
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        if (inner) cancelAnimationFrame(inner);
      };
    }
    setShown(false);
  }, [open]);

  useEffect(() => {
    if (open || !present) return;
    // transitionend is the real signal; this covers the case where the sheet
    // never painted and so never transitions.
    const t = setTimeout(() => setPresent(false), 700);
    return () => clearTimeout(t);
  }, [open, present]);

  useEffect(() => {
    if (!present) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && leaveRef.current(0);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [present]);

  if (!present) return null;
  const state = shown ? "open" : "closed";
  // Portal to <body> so the sheet escapes the app's stacking context and sits
  // above the bottom nav (otherwise the last field / save button is hidden).
  return createPortal(
    <div
      className="nst-modal-bg"
      dir="rtl"
      data-state={state}
      ref={backdropRef}
      onClick={() => leave()}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === "opacity" && !open) setPresent(false);
      }}
    >
      <div
        className="nst-modal"
        data-state={state}
        data-draggable={draggable}
        ref={sheet.ref as React.RefObject<HTMLDivElement>}
        onClick={(e) => e.stopPropagation()}
      >
        {draggable && <div className="nst-grabber" aria-hidden {...sheet.handleProps} />}
        {/* iOS sheet bar: Close on the leading edge, the task's name centred. */}
        <div className="nst-modal-head" {...(draggable ? sheet.handleProps : {})}>
          <button className="nst-del nst-close" onClick={() => leave()} aria-label="סגירה">
            <X size={18} />
          </button>
          <h3>{title}</h3>
          {done ? (
            <button className="btn btn-primary btn-sm nst-done" onClick={done.onClick} disabled={done.disabled}>
              {done.label}
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
