import type { Config } from "tailwindcss";

// Every colour is a theme token (see app/globals.css): dark "night" theme by default, light theme via <html data-theme="light">.
const t = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: t("paper"),
        raised: t("raised"),
        sunken: t("sunken"),
        stage: t("stage"),
        ink: t("ink"),
        "ink-soft": t("ink-soft"),
        line: t("line"),
        signal: t("signal"),
        "signal-tint": t("signal-tint"),
        "on-accent": t("on-accent"),
        violet: t("violet"),
        "violet-tint": t("violet-tint"),
        hot: t("hot"),
        "hot-tint": t("hot-tint"),
        warm: t("warm"),
        "warm-tint": t("warm-tint"),
        miss: t("miss"),
        "miss-tint": t("miss-tint"),
      },
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--c-signal) / 0.35), 0 8px 30px -8px rgb(var(--c-signal) / 0.45)",
        card: "0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 12px 32px -18px rgb(0 0 0 / 0.55)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
      },
      animation: {
        rise: "rise .5s cubic-bezier(.2,.7,.2,1) both",
        shimmer: "shimmer 6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
