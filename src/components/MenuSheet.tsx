import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Check, MessageCircleQuestion, SlidersHorizontal, Sparkles } from "lucide-react";
import { NAV } from "../lib/nav";
import { Modal } from "./ui";
import type { AssistantTab } from "./QuickAdd";

/**
 * The menu, opened from the button in the middle of the tab bar. It rises from
 * the bottom like the app's other sheets (and drags down to close), so it opens
 * under the thumb that tapped it. On top, the AI: quick add and ask the home.
 * Under it every section as a tile, and an edit mode for choosing which (up to
 * `max`) sections sit in the tab bar.
 */
export default function MenuSheet({
  bottom,
  max,
  onClose,
  onBottomChange,
  onAssistant,
}: {
  bottom: string[];
  max: number;
  onClose: () => void;
  onBottomChange: (next: string[]) => void;
  onAssistant: (tab: AssistantTab) => void;
}) {
  const [editing, setEditing] = useState(false);
  const full = bottom.length >= max;
  // Keep at least one tab: an empty bar would still take the space, and a stored
  // [] silently reverts to the defaults on the next load.
  const last = bottom.length <= 1;
  const toggle = (path: string) => {
    if (bottom.includes(path)) {
      if (!last) onBottomChange(bottom.filter((p) => p !== path));
    } else if (!full) onBottomChange([...bottom, path]);
  };

  return (
    <Modal open onClose={onClose} title={editing ? "עריכת הסרגל התחתון" : "תפריט"} done={editing ? { label: "סיום", onClick: () => setEditing(false) } : undefined}>
      {editing ? (
        <p className="section-sub" style={{ marginBottom: 12 }}>
          בחרו עד {max} סקשנים לסרגל התחתון ({bottom.length}/{max}). התפריט תמיד באמצע.
          {full && " כדי להוסיף אחר, הסירו קודם אחד."}
          {last && " חייב להישאר לפחות סקשן אחד."}
        </p>
      ) : (
        <div className="menu-ai">
          <button className="menu-ai-btn" onClick={() => onAssistant("add")}>
            <span className="menu-ai-ico">
              <Sparkles />
            </span>
            <span className="menu-ai-text">
              <b>הוספה מהירה</b>
              <small>משפט אחד או צילום מסך — לקניות, ללוז ולמשימות</small>
            </span>
          </button>
          <button className="menu-ai-btn" onClick={() => onAssistant("ask")}>
            <span className="menu-ai-ico">
              <MessageCircleQuestion />
            </span>
            <span className="menu-ai-text">
              <b>שאל את הבית</b>
              <small>מה יש היום, מה חסר, מה מחכה לאיסוף</small>
            </span>
          </button>
        </div>
      )}

      <nav className="menu-grid" aria-label="כל הסקשנים">
        {NAV.map(({ to, label, icon: Icon, end }) => {
          const picked = bottom.includes(to);
          if (editing) {
            const disabled = picked ? last : full;
            return (
              <button key={to} className="menu-tile" aria-pressed={picked} onClick={() => toggle(to)} disabled={disabled}>
                <span className="menu-tile-ico">
                  <Icon />
                </span>
                <span className="menu-tile-label">{label}</span>
                <span className={`nst-check menu-tile-check ${picked ? "on" : ""}`} aria-hidden>
                  <Check size={12} />
                </span>
              </button>
            );
          }
          return (
            <NavLink key={to} to={to} end={end} onClick={onClose} className={({ isActive }) => `menu-tile ${isActive ? "is-current" : ""}`}>
              <span className="menu-tile-ico">
                <Icon />
              </span>
              <span className="menu-tile-label">{label}</span>
            </NavLink>
          );
        })}
      </nav>

      {!editing && (
        <button className="btn btn-sm btn-block" style={{ marginTop: 14 }} onClick={() => setEditing(true)}>
          <SlidersHorizontal size={15} /> עריכת הסרגל התחתון
        </button>
      )}
      <p className="section-sub" style={{ marginTop: 12, fontSize: 11, textAlign: "center" }}>
        גרסה <bdi>{__APP_VERSION__}</bdi>
      </p>
    </Modal>
  );
}
