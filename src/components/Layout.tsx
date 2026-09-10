import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, ChevronDown, Moon, Sun, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";
import { isNight, toggleNight } from "../lib/theme";
import { NAV, BOTTOM_MAX, getBottomNav, setBottomNav, navItem } from "../lib/nav";
import NavDrawer from "./NavDrawer";


export default function Layout() {
  const { homeName, homes, selectHome, homeId, members } = useHome();
  const { user } = useAuth();
  const [switcher, setSwitcher] = useState(false);
  const [night, setNight] = useState(() => isNight());
  const [drawer, setDrawer] = useState(false);
  const [bottom, setBottom] = useState<string[]>(() => getBottomNav());
  const navigate = useNavigate();
  const location = useLocation();
  // The theme can also be changed from Settings, so re-read it on navigation.
  useEffect(() => setNight(isNight()), [location.pathname]);

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
              <div style={{ font: "600 18px var(--font-display)", color: "var(--text-bright)" }}>Nestly</div>
              <div
                style={{
                  font: "700 9.5px var(--font-body)",
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
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
          <header className="nst-topbar">
            <div className="nst-topbar-title">{current?.title ?? "Nestly"}</div>
            <div style={{ flex: 1 }} />
            <div style={{ position: "relative" }}>
              <button className="nst-chip" onClick={() => homes.length > 1 && setSwitcher((s) => !s)}>
                {homes.length > 1 && <ChevronDown size={14} />}
                {homeName ?? "הבית שלי"}
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
            <button
              className="nst-iconbtn plain"
              onClick={() => setNight(toggleNight() === "garden-night")}
              title={night ? "מצב יום" : "מצב לילה"}
              aria-label={night ? "מצב יום" : "מצב לילה"}
            >
              {night ? <Sun /> : <Moon />}
            </button>
            <NotificationBell />
            <button className="nst-iconbtn plain nst-burger" onClick={() => setDrawer(true)} title="תפריט" aria-label="תפריט">
              <Menu />
            </button>
          </header>

          <main className="nst-content">
            <Outlet />
          </main>
        </div>
      </div>

      {/* bottom nav (mobile) */}
      <nav className="nst-bottomnav">
        <div className="nst-bn-grid">
          {bottom.map((path) => {
            const item = navItem(path);
            if (!item) return null;
            const Icon = item.icon;
            return (
              <NavLink key={path} to={path} end={item.end} className={({ isActive }) => `nst-bn ${isActive ? "active" : ""}`}>
                <Icon />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {drawer && (
        <NavDrawer
          bottom={bottom}
          max={BOTTOM_MAX}
          onClose={() => setDrawer(false)}
          onBottomChange={(next) => {
            setBottom(next);
            setBottomNav(next);
          }}
        />
      )}
    </div>
  );
}
