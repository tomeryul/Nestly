import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Check, ChevronLeft, Menu, MessageCircleQuestion, PanelBottom, Sparkles } from "lucide-react";
import { NAV, navItem, type NavItem } from "../lib/nav";
import { Modal } from "./ui";
import type { AssistantTab } from "./QuickAdd";

/**
 * The menu, opened from the button in the middle of the tab bar. It rises from
 * the bottom like the app's other sheets (and drags down to close), so it opens
 * under the thumb that tapped it. Laid out the way iOS lays out a sheet like this:
 * grouped sections on the grouped background — the AI on top, then every section
 * as an icon in its own colour (as each app has one in Settings), then a row into
 * the tab bar's editor — and the version as a footnote. The editor is a page of
 * the same sheet: a preview of the bar, a list with a check per section, Done.
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
      <div className="menu-sheet">
        {editing ? (
          <>
            <h4 className="menu-section-head">כך ייראה הסרגל</h4>
            <BarPreview bottom={bottom} />
            <div className="menu-section" role="group" aria-label="סקשנים בסרגל התחתון">
              {NAV.map(({ to, label, icon: Icon, tint }) => {
                const picked = bottom.includes(to);
                return (
                  <button key={to} className="menu-row" aria-pressed={picked} disabled={picked ? last : full} onClick={() => toggle(to)}>
                    <span className="menu-ico" data-tint={tint}>
                      <Icon />
                    </span>
                    <span className="menu-row-text">
                      <b>{label}</b>
                    </span>
                    <span className={`nst-check ${picked ? "on" : ""}`} aria-hidden>
                      <Check size={12} />
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="menu-section-foot">
              עד {max} סקשנים בסרגל ({bottom.length}/{max}); התפריט תמיד באמצע.
              {full && " כדי להוסיף אחר, הסירו קודם אחד."}
              {last && " חייב להישאר לפחות סקשן אחד."}
            </p>
          </>
        ) : (
          <>
            <div className="menu-section menu-ai">
              <button className="menu-row" onClick={() => onAssistant("add")}>
                <span className="menu-ico" data-tint="accent">
                  <Sparkles />
                </span>
                <span className="menu-row-text">
                  <b>הוספה מהירה</b>
                  <small>קניות, לוז ומשימות במשפט או בצילום מסך</small>
                </span>
              </button>
              <button className="menu-row" onClick={() => onAssistant("ask")}>
                <span className="menu-ico" data-tint="accent">
                  <MessageCircleQuestion />
                </span>
                <span className="menu-row-text">
                  <b>שאל את הבית</b>
                  <small>מה יש היום, מה חסר, מה מחכה לאיסוף</small>
                </span>
              </button>
            </div>

            <h4 className="menu-section-head">כל הסקשנים</h4>
            <nav className="menu-section menu-grid" aria-label="כל הסקשנים">
              {NAV.map(({ to, label, icon: Icon, tint, end }) => (
                <NavLink key={to} to={to} end={end} onClick={onClose} className={({ isActive }) => `menu-app ${isActive ? "is-current" : ""}`}>
                  <span className="menu-ico" data-tint={tint}>
                    <Icon />
                  </span>
                  <span className="menu-app-label">{label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="menu-section">
              <button className="menu-row" onClick={() => setEditing(true)}>
                <span className="menu-ico" data-tint="gray">
                  <PanelBottom />
                </span>
                <span className="menu-row-text">
                  <b>עריכת הסרגל התחתון</b>
                </span>
                <ChevronLeft className="menu-chevron" aria-hidden />
              </button>
            </div>

            <p className="menu-version">
              Nestly · גרסה <bdi>{__APP_VERSION__}</bdi>
            </p>
          </>
        )}
      </div>
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
