import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Check, Menu, MessageCircleQuestion, SlidersHorizontal, Sparkles } from "lucide-react";
import { NAV, navItem, type NavItem } from "../lib/nav";
import { Modal } from "./ui";
import type { AssistantTab } from "./QuickAdd";

/**
 * The menu, opened from the button in the middle of the tab bar. It rises from
 * the bottom like the app's other sheets (and drags down to close), so it opens
 * under the thumb that tapped it. Built as an iOS menu in the app's own look:
 * the AI on top as a row of icon-over-label buttons (the medium menu layout),
 * then every section as a plain row — symbol and name, no separators — with the
 * current one in the same lens the tab bar uses. Editing the tab bar is a page
 * of the same sheet: a preview of the bar, a check per section, Done.
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
    <Modal open onClose={onClose} title={editing ? "הסרגל התחתון" : "תפריט"} done={editing ? { label: "סיום", onClick: () => setEditing(false) } : undefined}>
      {editing ? (
        <>
          <BarPreview bottom={bottom} />
          <div className="menu-list" role="group" aria-label="סקשנים בסרגל התחתון">
            {NAV.map(({ to, label, icon: Icon }) => {
              const picked = bottom.includes(to);
              return (
                <button key={to} className="menu-item" aria-pressed={picked} disabled={picked ? last : full} onClick={() => toggle(to)}>
                  <span className={`nst-check ${picked ? "on" : ""}`} aria-hidden>
                    <Check size={12} />
                  </span>
                  <Icon />
                  <span className="menu-item-label">{label}</span>
                </button>
              );
            })}
          </div>
          <p className="menu-foot">
            עד {max} סקשנים ({bottom.length}/{max}); התפריט תמיד באמצע.
            {full && " כדי להוסיף אחר, הסירו קודם אחד."}
            {last && " חייב להישאר לפחות סקשן אחד."}
          </p>
        </>
      ) : (
        <>
          <div className="menu-ai">
            <button className="menu-ai-btn" onClick={() => onAssistant("add")}>
              <Sparkles />
              הוספה מהירה
            </button>
            <button className="menu-ai-btn" onClick={() => onAssistant("ask")}>
              <MessageCircleQuestion />
              שאל את הבית
            </button>
          </div>

          <nav className="menu-list" aria-label="כל הסקשנים">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} onClick={onClose} className={({ isActive }) => `menu-item ${isActive ? "is-current" : ""}`}>
                <Icon />
                <span className="menu-item-label">{label}</span>
              </NavLink>
            ))}
          </nav>

          <button className="btn btn-block menu-edit" onClick={() => setEditing(true)}>
            <SlidersHorizontal size={16} /> עריכת הסרגל התחתון
          </button>
          <p className="menu-foot menu-version">
            גרסה <bdi>{__APP_VERSION__}</bdi>
          </p>
        </>
      )}
    </Modal>
  );
}

/** The tab bar as it will be: half the sections each side of the menu button, as Layout places them. */
function BarPreview({ bottom }: { bottom: string[] }) {
  const items = bottom.map(navItem).filter((n): n is NavItem => !!n);
  const half = Math.ceil(items.length / 2);
  const cell = ({ to, label, icon: Icon }: NavItem) => (
    <span key={to} className="menu-bar-item">
      <Icon />
      <small>{label}</small>
    </span>
  );
  return (
    <div className="menu-bar-preview" aria-hidden>
      {items.slice(0, half).map(cell)}
      <span className="menu-bar-disc">
        <Menu />
      </span>
      {items.slice(half).map(cell)}
      {items.length % 2 === 1 && <span className="menu-bar-item" />}
    </div>
  );
}
