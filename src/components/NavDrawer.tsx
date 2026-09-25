import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { Home, X, Check, SlidersHorizontal } from "lucide-react";
import { NAV } from "../lib/nav";
import { useDragDismiss } from "../lib/dragDismiss";
import { clamp, presentedOffset, useReducedMotion } from "../lib/motion";

/**
 * Full-height menu listing every section, plus an edit mode for choosing which
 * (up to `max`) sections are pinned to the bottom bar. Portalled to the body so
 * it escapes the app shell's stacking context, like Modal does.
 */
export default function NavDrawer({
  bottom,
  max,
  onClose,
  onBottomChange,
}: {
  bottom: string[];
  max: number;
  onClose: () => void;
  onBottomChange: (next: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  // Mounted at the closed position for one frame, then opened, so there is
  // something to animate from; the exit plays before the parent unmounts us.
  const [shown, setShown] = useState(false);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const closing = useRef(false);
  const leaveRef = useRef<(velocity: number) => void>(() => {});
  const reduce = useReducedMotion();

  const drawer = useDragDismiss({
    axis: "x",
    direction: -1, // it lives on the inline-start edge and leaves through it
    enabled: !reduce,
    onDismiss: (v) => leaveRef.current(v),
    onProgress: (p) => {
      const b = backdropRef.current;
      if (!b) return;
      b.style.transition = p > 0 ? "none" : "";
      b.style.opacity = p > 0 ? String(1 - p) : "";
    },
  });

  const leave = useCallback(
    (velocity = 0) => {
      if (closing.current) return;
      closing.current = true;
      const el = drawer.ref.current;
      if (el) {
        if (velocity > 0) {
          const remaining = Math.max(el.offsetWidth + presentedOffset(el, "x"), 0);
          el.style.transitionDuration = `${clamp(remaining / velocity, 160, 380)}ms`;
        }
        el.style.transform = "";
      }
      const b = backdropRef.current;
      if (b) {
        b.style.transition = "";
        b.style.opacity = "0";
      }
      setShown(false);
      // Give the exit its run before the parent takes the element away.
      setTimeout(onClose, reduce ? 200 : 320);
    },
    [drawer.ref, onClose, reduce],
  );
  leaveRef.current = leave;

  useEffect(() => {
    // Both frames cancellable — unmounting inside the window must not leave a
    // stale open queued.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && leaveRef.current(0);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const state = shown ? "open" : "closed";

  const full = bottom.length >= max;
  // Keep at least one tab: an empty bar would still occupy space, and the stored
  // [] would silently revert to the defaults on the next load.
  const last = bottom.length <= 1;
  const toggle = (path: string) => {
    if (bottom.includes(path)) {
      if (!last) onBottomChange(bottom.filter((p) => p !== path));
    } else if (!full) {
      onBottomChange([...bottom, path]);
    }
  };

  return createPortal(
    <div className="nst-drawer-wrap" data-state={state} ref={backdropRef} onClick={() => leave()}>
      <aside
        className="nst-drawer"
        data-state={state}
        ref={drawer.ref as React.RefObject<HTMLElement>}
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        {...drawer.handleProps}
      >
        <div className="nst-drawer-head">
          <span className="nst-logo-tile">
            <Home size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "600 20px var(--font-display)", color: "var(--text-bright)" }}>Nestly</div>
            <div style={{ font: "500 11px var(--font-body)", textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-muted)", marginTop: 1 }}>
              כל הסקשנים
            </div>
          </div>
          <button className="nst-del" onClick={() => leave()} aria-label="סגירה">
            <X size={18} />
          </button>
        </div>

        <button className={`btn btn-sm ${editing ? "btn-primary" : ""}`} style={{ margin: "0 1rem 0.75rem", justifyContent: "center" }} onClick={() => setEditing((v) => !v)}>
          <SlidersHorizontal size={15} /> {editing ? "סיום עריכה" : "עריכת הסרגל התחתון"}
        </button>

        {editing && (
          <p className="section-sub" style={{ margin: "0 1rem 0.75rem" }}>
            בחרו עד {max} סקשנים שיופיעו בתחתית המסך ({bottom.length}/{max} נבחרו).
            {full && " כדי להוסיף אחר, הסירו קודם אחד."}
            {last && " חייב להישאר לפחות סקשן אחד."}
          </p>
        )}

        <nav className="nst-drawer-nav">
          {NAV.map(({ to, label, icon: Icon, end }) => {
            const picked = bottom.includes(to);
            if (editing) {
              const disabled = picked ? last : full;
              return (
                <button
                  key={to}
                  className={`nst-drawer-item ${picked ? "picked" : ""}`}
                  onClick={() => toggle(to)}
                  disabled={disabled}
                  style={disabled ? { opacity: 0.4, cursor: "default" } : undefined}
                >
                  <Icon />
                  <span style={{ flex: 1 }}>{label}</span>
                  <span className={`nst-check ${picked ? "on" : ""}`} style={{ width: 22, height: 22 }}>
                    <Check size={12} />
                  </span>
                </button>
              );
            }
            return (
              <NavLink key={to} to={to} end={end} onClick={() => leave()} className={({ isActive }) => `nst-drawer-item ${isActive ? "active" : ""}`}>
                <Icon />
                <span style={{ flex: 1 }}>{label}</span>
                {picked && <span className="nst-tag">בתחתית</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Nothing is unreachable when a section is off the bottom bar — it lives here. */}
        <p className="section-sub" style={{ margin: "auto 1rem 1.25rem", fontSize: 12 }}>
          כל הסקשנים תמיד זמינים מהתפריט הזה, גם אם הם לא בסרגל התחתון.
        </p>
      </aside>
    </div>,
    document.body
  );
}
