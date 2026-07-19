import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built assets resolve correctly no matter which subpath
// GitHub Pages serves the site from (e.g. /Nestly/). Works because the app uses
// HashRouter, so the path portion of the URL never changes.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
