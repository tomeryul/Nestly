import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Home, ShoppingCart, ChefHat, CalendarDays, Settings, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useHome } from "../context/HomeContext";
import NotificationBell from "./NotificationBell";

const NAV = [
  { to: "/", label: "בית", icon: Home, end: true },
  { to: "/shopping", label: "קניות", icon: ShoppingCart, end: false },
  { to: "/cooking", label: "בישולים", icon: ChefHat, end: false },
  { to: "/schedule", label: "לוז", icon: CalendarDays, end: false },
  { to: "/settings", label: "הגדרות", icon: Settings, end: false },
];

export default function Layout() {
  const { homeName, homes, selectHome, homeId } = useHome();
  const [switcher, setSwitcher] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-100 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="relative">
          <button
            onClick={() => homes.length > 1 && setSwitcher((s) => !s)}
            className="flex items-center gap-1.5"
          >
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8 rounded-lg" />
            <div className="text-right leading-tight">
              <p className="text-[11px] text-slate-400">Nestly</p>
              <p className="flex items-center gap-1 text-sm font-semibold text-slate-800">
                {homeName ?? "הבית שלי"}
                {homes.length > 1 && <ChevronDown size={14} className="text-slate-400" />}
              </p>
            </div>
          </button>
          {switcher && (
            <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-100">
              {homes.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    selectHome(h.id);
                    setSwitcher(false);
                  }}
                  className={`block w-full px-4 py-2.5 text-right text-sm hover:bg-slate-50 ${
                    h.id === homeId ? "font-semibold text-brand-700" : "text-slate-700"
                  }`}
                >
                  {h.name}
                </button>
              ))}
              <button
                onClick={() => {
                  setSwitcher(false);
                  navigate("/onboarding");
                }}
                className="block w-full border-t border-slate-100 px-4 py-2.5 text-right text-sm text-brand-600 hover:bg-slate-50"
              >
                + בית חדש
              </button>
            </div>
          )}
        </div>
        <NotificationBell />
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl border-t border-slate-100 bg-white/95 backdrop-blur">
        <div className="grid grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[11px] ${
                  isActive ? "text-brand-600" : "text-slate-400"
                }`
              }
            >
              <Icon size={22} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
