import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { Home, X, Check, SlidersHorizontal } from "lucide-react";
import { NAV } from "../lib/nav";

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div className="nst-drawer-wrap" onClick={onClose}>
      <aside className="nst-drawer" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="nst-drawer-head">
          <span className="nst-logo-tile">
            <Home size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "600 17px var(--font-display)", color: "var(--text-bright)" }}>Nestly</div>
            <div style={{ font: "700 9.5px var(--font-body)", textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-muted)", marginTop: 1 }}>
              כל הסקשנים
            </div>
          </div>
          <button className="nst-del" onClick={onClose} aria-label="סגירה">
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
              <NavLink key={to} to={to} end={end} onClick={onClose} className={({ isActive }) => `nst-drawer-item ${isActive ? "active" : ""}`}>
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
