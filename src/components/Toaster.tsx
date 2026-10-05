import { useEffect, useState, type CSSProperties } from "react";
import { Toaster } from "sonner";
import { getTheme, isNight, onThemeChange } from "../lib/theme";

// Clear of the floating tab bar (62pt tall, floating 10pt or the home-indicator
// inset above the bottom edge) with a 12pt breath between the two.
const ABOVE_TAB_BAR = "calc(max(10px, env(safe-area-inset-bottom)) + 74px)";

/**
 * The one toast host, mounted once at the root. Toasts are glass like the bars
 * they float with, take the app's own palette (all six skins, not Sonner's
 * light/dark pair), read right-to-left, and sit just above the tab bar where the
 * thumb already is — so an Undo is a short reach, not a trip to the top.
 */
export function AppToaster() {
  const [night, setNight] = useState(() => isNight(getTheme()));
  useEffect(() => onThemeChange((t) => setNight(isNight(t))), []);
  return (
    <Toaster
      dir="rtl"
      theme={night ? "dark" : "light"}
      position="bottom-center"
      offset={{ bottom: ABOVE_TAB_BAR }}
      mobileOffset={{ bottom: ABOVE_TAB_BAR, left: 12, right: 12 }}
      gap={8}
      style={
        {
          "--normal-bg": "color-mix(in srgb, var(--surface) 82%, transparent)",
          "--normal-border": "var(--glass-edge)",
          "--normal-text": "var(--text-bright)",
          "--border-radius": "22px",
        } as CSSProperties
      }
      toastOptions={{
        style: {
          font: "500 var(--t-subhead)/1.35 var(--font-body)",
          padding: "12px 14px 12px 12px",
          backdropFilter: "blur(20px) saturate(1.8)",
          WebkitBackdropFilter: "blur(20px) saturate(1.8)",
          boxShadow: "inset 0 1px 1px var(--glass-highlight), 0 10px 30px -10px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.08)",
        },
        actionButtonStyle: {
          background: "var(--accent)",
          color: "var(--on-accent)",
          font: "600 var(--t-footnote) var(--font-body)",
          borderRadius: "var(--r-capsule)",
          height: 32,
          padding: "0 14px",
        },
      }}
    />
  );
}
