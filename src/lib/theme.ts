export type ThemeKey = "garden" | "garden-night" | "warm-dark" | "warm-light" | "cool-dark" | "midnight";

export const THEMES: { key: ThemeKey; name: string; swatches: [string, string, string]; bg: string }[] = [
  { key: "garden", name: "גן", swatches: ["#f5f1e6", "#5a8a5e", "#d8e9d3"], bg: "#f5f1e6" },
  { key: "garden-night", name: "לילה", swatches: ["#1f1c19", "#8fbf86", "#2a3826"], bg: "#161412" },
  { key: "warm-dark", name: "ורד", swatches: ["#f7f4f5", "#c98a9b", "#f4e3e9"], bg: "#f7f4f5" },
  { key: "warm-light", name: "שמיים", swatches: ["#f2f5f7", "#6fa3c0", "#def0f8"], bg: "#f2f5f7" },
  { key: "cool-dark", name: "עלה", swatches: ["#f3f6f2", "#7faa84", "#e6f0e7"], bg: "#f3f6f2" },
  { key: "midnight", name: "לבנדר", swatches: ["#f5f4f8", "#9a8fc4", "#ece8f5"], bg: "#f5f4f8" },
];

const KEY = "nestly.theme";

export function getTheme(): ThemeKey {
  const t = localStorage.getItem(KEY) as ThemeKey | null;
  return t && THEMES.some((x) => x.key === t) ? t : "garden";
}

export function applyTheme(t: ThemeKey) {
  document.documentElement.dataset.theme = t;
  const bg = THEMES.find((x) => x.key === t)?.bg ?? "#f5f1e6";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
}

export function setTheme(t: ThemeKey) {
  localStorage.setItem(KEY, t);
  applyTheme(t);
}

export function initTheme() {
  applyTheme(getTheme());
}
