import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, ChevronDown, Moon, Sun, Menu, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";
import { isNight, onThemeChange, toggleNight } from "../lib/theme";
import { NAV, BOTTOM_MAX, getBottomNav, setBottomNav, navItem } from "../lib/nav";
import MenuSheet from "./MenuSheet";
import QuickAdd, { ASSISTANT_EVENT, type AssistantTab } from "./QuickAdd";
import { useTabLens } from "../lib/tabLens";


export default function Layout() {
  const { homeName, homes, selectHome, homeId, members } = useHome();
  const { user } = useAuth();
  const [switcher, setSwitcher] = useState(false);
  const [night, setNight] = useState(() => isNight());
  const [drawer, setDrawer] = useState(false);
  // The ✨ sheet: closed, or open on one of its tabs (null = the last one used).
  const [assistant, setAssistant] = useState<{ tab: AssistantTab | null } | null>(null);
  const [bottom, setBottom] = useState<string[]>(() => getBottomNav());
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  // The page's large title lives in the content; the bar only repeats it once
  // that title has scrolled underneath — one title on screen at a time.
  // Keyed by route, so a new page starts hidden in the very render that shows it
  // instead of inheriting the last page's state for a frame.
  const [titleState, setTitleState] = useState({ path: "", inBar: false });
  const barRef = useRef<HTMLElement | null>(null);
  // One selection lens for the whole tab bar, so switching tabs slides it across
  // rather than switching one tab's background off and another's on.
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const lensRef = useRef<HTMLSpanElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  // The theme can change from Settings or from the system appearance.
  useEffect(() => onThemeChange((t) => setNight(isNight(t))), []);
  // Any screen can open the ✨ sheet on a given tab (openAssistant).
  useEffect(() => {
    const open = (e: Event) => setAssistant({ tab: (e as CustomEvent<AssistantTab>).detail ?? null });
    window.addEventListener(ASSISTANT_EVENT, open);
    return () => window.removeEventListener(ASSISTANT_EVENT, open);
  }, []);

  // The top bar is a material the content passes under: it stays clear until
  // something is actually behind it, then frosts over and grows its hairline.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 2);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [location.pathname]);

  useTabLens(tabsRef, lensRef, [location.pathname, bottom]);

  useEffect(() => {
    const content = contentRef.current;
    const bar = barRef.current;
    if (!content || !bar) return;
    let io: IntersectionObserver | null = null;
    let watched: Element | null = null;
    // Pages render their title after data arrives, so keep looking for it.
    const path = location.pathname;
    const set = (inBar: boolean) => setTitleState({ path, inBar });
    const attach = () => {
      const title = content.querySelector(".page-title");
      if (title === watched && title) return;
      io?.disconnect();
      watched = title;
      if (!title) {
        // Still loading (spinner showing): the title is on its way, keep the bar clear.
        // Loaded with no large title (e.g. the dashboard): the bar carries the title.
        set(!content.querySelector(".animate-spin"));
        return;
      }
      io = new IntersectionObserver(([e]) => set(!e.isIntersecting), {
        rootMargin: `-${bar.offsetHeight}px 0px 0px 0px`,
      });
      io.observe(title);
    };
    attach();
    const mo = new MutationObserver(attach);
    mo.observe(content, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io?.disconnect();
    };
  }, [location.pathname]);

  const current = NAV.find((n) => (n.end ? location.pathname === "/" : location.pathname.startsWith(n.to)));
  const me = members.find((m) => m.user_id === user?.id);
  const meName = me?.profile?.display_name ?? "אני";
  const initial = (meName || "?").charAt(0);

  return (
    <div className="nst-root" dir="rtl">
      <div className="nst-shell">
        {/* sidebar (desktop) */}
        <aside className="nst-sidebar">
          <div className="nst-side-head">
            <span className="nst-logo-tile">
              <Home size={21} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "600 20px var(--font-display)", color: "var(--text-bright)" }}>Nestly</div>
              <div
                style={{
                  font: "500 11px var(--font-body)",
                  color: "var(--text-muted)",
                  marginTop: 1,
                }}
              >
                משק בית משותף
              </div>
            </div>
          </div>
          <nav className="nst-nav">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `nst-nav-item ${isActive ? "active" : ""}`}>
                <Icon /> <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="nst-side-foot">
            <button className="user-chip" onClick={() => navigate("/settings")}>
              <span className="nst-avatar" style={{ width: 34, height: 34, fontSize: 14 }}>
                {initial}
              </span>
              <span style={{ textAlign: "right", flex: 1, minWidth: 0 }}>
                <strong>{meName}</strong>
                <span className="sub">{homeName}</span>
              </span>
            </button>
          </div>
        </aside>

        {/* main */}
        <div className="nst-main">
          <header
            className="nst-topbar"
            ref={barRef}
            data-scrolled={scrolled}
            data-title={titleState.path === location.pathname && titleState.inBar ? "shown" : "hidden"}
          >
            <div className="nst-topbar-title">{current?.title ?? "Nestly"}</div>
            <div style={{ flex: 1 }} />
            <div className="nst-topbar-home">
              <button className="nst-chip nst-glass" title={homeName ?? undefined} onClick={() => homes.length > 1 && setSwitcher((s) => !s)}>
                {homes.length > 1 && <ChevronDown size={14} />}
                <span className="nst-chip-label" dir="auto">{homeName ?? "הבית שלי"}</span>
              </button>
              {switcher && (
                <div className="nst-dropdown">
                  {homes.map((h) => (
                    <button
                      key={h.id}
                      className={h.id === homeId ? "on" : ""}
                      onClick={() => {
                        selectHome(h.id);
                        setSwitcher(false);
                      }}
                    >
                      {h.name}
                    </button>
                  ))}
                  <button
                    style={{ borderTop: "1px solid var(--border)", color: "var(--accent)", fontWeight: 700 }}
                    onClick={() => {
                      setSwitcher(false);
                      navigate("/onboarding");
                    }}
                  >
                    + בית חדש
                  </button>
                </div>
              )}
            </div>
            {/* Related bar items share one piece of glass, as native bar buttons do. */}
            <div className="nst-bar-group nst-glass">
              <button className="nst-iconbtn plain nst-quickadd" onClick={() => setAssistant({ tab: null })} title="עוזר הבית: הוספה מהירה ושאלות" aria-label="עוזר הבית">
                <Sparkles />
              </button>
              <button
                className="nst-iconbtn plain"
                onClick={() => setNight(toggleNight() === "garden-night")}
                title={night ? "מצב יום" : "מצב לילה"}
                aria-label={night ? "מצב יום" : "מצב לילה"}
              >
                {night ? <Sun /> : <Moon />}
              </button>
              <NotificationBell />
            </div>
          </header>

          <main className="nst-content" ref={contentRef}>
            <Outlet />
          </main>
        </div>
      </div>

      {/* bottom nav (mobile): pinned sections either side of the menu button, which
          stays in the exact middle — a spacer evens out an odd number of tabs. */}
      <nav className="nst-bottomnav nst-glass">
        <div className="nst-bn-grid" ref={tabsRef}>
          <span className="nst-bn-lens" ref={lensRef} aria-hidden="true" />
          {(() => {
            const tab = (path: string): ReactNode => {
              const item = navItem(path);
              if (!item) return null;
              const Icon = item.icon;
              return (
                <NavLink key={path} to={path} end={item.end} className={({ isActive }) => `nst-bn ${isActive ? "active" : ""}`}>
                  <Icon />
                  <span>{item.label}</span>
                </NavLink>
              );
            };
            const half = Math.ceil(bottom.length / 2);
            const before = bottom.slice(0, half);
            const after = bottom.slice(half);
            const spacer = <span className="nst-bn nst-bn-spacer" aria-hidden key="spacer" />;
            return (
              <>
                {before.map(tab)}
                <button className="nst-bn-menu" onClick={() => setDrawer(true)} aria-label="תפריט" aria-haspopup="dialog" title="תפריט">
                  <span className="nst-bn-menu-disc">
                    <Menu />
                  </span>
                </button>
                {after.map(tab)}
                {after.length < before.length && spacer}
              </>
            );
          })()}
        </div>
      </nav>

      {assistant && <QuickAdd onClose={() => setAssistant(null)} initialTab={assistant.tab ?? undefined} />}

      {drawer && (
        <MenuSheet
          bottom={bottom}
          max={BOTTOM_MAX}
          onClose={() => setDrawer(false)}
          onBottomChange={(next) => {
            setBottom(next);
            setBottomNav(next);
          }}
          onAssistant={(tab) => {
            setDrawer(false);
            setAssistant({ tab });
          }}
        />
      )}
    </div>
  );
}
