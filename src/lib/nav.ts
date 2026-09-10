import { Home, ShoppingCart, ChefHat, Sparkles, WashingMachine, CalendarDays, ListTodo, Package, Settings } from "lucide-react";
import type { ComponentType } from "react";

export type NavItem = {
  to: string;
  label: string;
  title: string;
  icon: ComponentType<{ size?: number | string }>;
  end?: boolean;
};

/** Every section in the app. The hamburger menu shows all of these. */
export const NAV: NavItem[] = [
  { to: "/", label: "בית", title: "בית", icon: Home, end: true },
  { to: "/shopping", label: "קניות", title: "קניות", icon: ShoppingCart },
  { to: "/cooking", label: "בישולים", title: "בישולים", icon: ChefHat },
  { to: "/cleaning", label: "ניקיון", title: "ניקיון", icon: Sparkles },
  { to: "/laundry", label: "כביסות", title: "כביסות", icon: WashingMachine },
  { to: "/schedule", label: "לוז", title: "לוז שבועי", icon: CalendarDays },
  { to: "/personal", label: "משימות", title: "משימות אישיות", icon: ListTodo },
  { to: "/deliveries", label: "משלוחים", title: "משלוחים", icon: Package },
  { to: "/settings", label: "הגדרות", title: "הגדרות", icon: Settings },
];

export const navItem = (to: string) => NAV.find((n) => n.to === to);

/** How many sections fit across the bottom bar on a phone. */
export const BOTTOM_MAX = 5;

const KEY = "nestly.bottomNav";
const DEFAULT_BOTTOM = ["/", "/shopping", "/schedule", "/cleaning", "/personal"];

/** The sections pinned to the bottom bar, newest-valid-first and capped at BOTTOM_MAX. */
export function getBottomNav(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_BOTTOM;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_BOTTOM;
    const valid = parsed.filter((p): p is string => typeof p === "string" && !!navItem(p)).slice(0, BOTTOM_MAX);
    return valid.length ? valid : DEFAULT_BOTTOM;
  } catch {
    return DEFAULT_BOTTOM;
  }
}

export function setBottomNav(paths: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(paths.slice(0, BOTTOM_MAX)));
  } catch {
    /* private mode — the bar just falls back to the default next load */
  }
}
