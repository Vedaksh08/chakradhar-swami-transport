import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Brand pulled straight from the Chakradhar Swami Transport invoice.
        navy: {
          50: "#f2f5f9",
          100: "#e2e9f2",
          200: "#c7d5e7",
          300: "#9db7d3",
          400: "#6c92ba",
          500: "#4a73a1",
          600: "#375c86",
          700: "#2d496d",
          800: "#17365d",
          900: "#102846",
          950: "#0a1a2e",
        },
        gold: {
          50: "#fff7e5",
          100: "#fdedc8",
          200: "#fadb91",
          300: "#f0c25c",
          400: "#e3ab3c",
          500: "#d59b2a",
          600: "#b57d1c",
          700: "#8f5f18",
          800: "#754c1a",
          900: "#633f19",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Segoe UI", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,40,70,.06), 0 4px 16px rgba(16,40,70,.06)",
        pop: "0 12px 40px rgba(16,40,70,.18)",
      },
    },
  },
  plugins: [],
};

export default config;
