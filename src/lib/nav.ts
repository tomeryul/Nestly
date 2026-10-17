import { Home, ShoppingCart, ChefHat, Sparkles, WashingMachine, CalendarDays, ListTodo, Package, Settings } from "lucide-react";
import type { ComponentType } from "react";

export type NavItem = {
  to: string;
  label: string;
  title: string;
  icon: ComponentType<{ size?: number | string }>;
  /** The section's colour in the menu, one of the iOS system colours (--sys-*), as each app in Settings has its own. */
  tint: string;
  end?: boolean;
};

/** Every section in the app. The hamburger menu shows all of these. */
export const NAV: NavItem[] = [
  { to: "/", label: "בית", title: "בית", icon: Home, tint: "blue", end: true },
  { to: "/shopping", label: "קניות", title: "קניות", icon: ShoppingCart, tint: "green" },
  { to: "/cooking", label: "בישולים", title: "בישולים", icon: ChefHat, tint: "orange" },
  { to: "/cleaning", label: "ניקיון", title: "ניקיון", icon: Sparkles, tint: "teal" },
  { to: "/laundry", label: "כביסות", title: "כביסות", icon: WashingMachine, tint: "indigo" },
  { to: "/schedule", label: "לוז", title: "לוז שבועי", icon: CalendarDays, tint: "red" },
  { to: "/personal", label: "משימות", title: "משימות אישיות", icon: ListTodo, tint: "purple" },
  { to: "/deliveries", label: "משלוחים", title: "משלוחים", icon: Package, tint: "brown" },
  { to: "/settings", label: "הגדרות", title: "הגדרות", icon: Settings, tint: "gray" },
];

export const navItem = (to: string) => NAV.find((n) => n.to === to);

/** How many sections sit in the bottom bar on a phone: two each side of the menu button. */
export const BOTTOM_MAX = 4;

const KEY = "nestly.bottomNav";
const DEFAULT_BOTTOM = ["/", "/shopping", "/schedule", "/personal"];

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
