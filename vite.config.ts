import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

// The commit being built, shown at the bottom of the menu so it's possible to
// tell at a glance whether a phone is running the latest deploy.
const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
})();

// Relative base so the built assets resolve correctly no matter which subpath
// GitHub Pages serves the site from (e.g. /Nestly/). Works because the app uses
// HashRouter, so the path portion of the URL never changes.
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(commit) },
});
