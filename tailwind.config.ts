import type { Config } from "tailwindcss";

/**
 * Dark, IBM-Plex, teal-accent aesthetic ported from the original single-file tool.
 * Colors are exposed as CSS variables in globals.css and surfaced here as semantic tokens.
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "IBM Plex Sans", "sans-serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "monospace"],
      },
      colors: {
        // Vars are raw HSL channels (see globals.css) + the <alpha-value> token,
        // so Tailwind opacity modifiers (bg-accent/10, border-danger/20, …) work.
        bg: "hsl(var(--bg) / <alpha-value>)",
        surface: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          2: "hsl(var(--surface2) / <alpha-value>)",
          3: "hsl(var(--surface3) / <alpha-value>)",
        },
        border: "hsl(var(--border) / <alpha-value>)",
        border2: "hsl(var(--border2) / <alpha-value>)",
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          2: "hsl(var(--accent2) / <alpha-value>)",
        },
        warn: "hsl(var(--warn) / <alpha-value>)",
        danger: "hsl(var(--danger) / <alpha-value>)",
        text: {
          DEFAULT: "hsl(var(--text) / <alpha-value>)",
          2: "hsl(var(--text2) / <alpha-value>)",
          3: "hsl(var(--text3) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "12px",
        md: "8px",
        sm: "4px",
      },
      keyframes: {
        spin: { to: { transform: "rotate(360deg)" } },
        slideDown: {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "slide-down": "slideDown 0.25s ease",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
