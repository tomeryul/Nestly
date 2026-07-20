/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Body / UI
        sans: ['"Plus Jakarta Sans"', "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        // Headings / numerics
        display: ['"Spectral"', "Georgia", "serif"],
      },
      colors: {
        // Sage accent ("Garden")
        brand: {
          50: "#eef4ee",
          100: "#d8e9d3",
          200: "#c3ddbe",
          300: "#a9cba3",
          400: "#83b083",
          500: "#6b9a6f",
          600: "#5a8a5e",
          700: "#487049",
          800: "#3b5c3e",
          900: "#2e5a32",
        },
        // Warm neutral ramp — overrides Tailwind's cool "slate" everywhere it's
        // used across the app, instantly warming the UI to the cream palette.
        slate: {
          50: "#faf7ed",
          100: "#f0ebdb",
          200: "#ece6d4",
          300: "#ddd4bd",
          400: "#a89e8f",
          500: "#847b6f",
          600: "#56504a",
          700: "#3a352e",
          800: "#2d2924",
          900: "#1a1714",
        },
      },
      boxShadow: {
        sm: "0 1px 2px rgba(80,70,40,0.04)",
        DEFAULT: "0 2px 8px rgba(80,70,40,0.06), 0 8px 20px -10px rgba(80,70,40,0.08)",
        lg: "0 6px 20px rgba(80,70,40,0.08), 0 18px 48px -16px rgba(80,70,40,0.14)",
      },
    },
  },
  plugins: [],
};
