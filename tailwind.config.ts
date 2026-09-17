import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#EFF1EC",
        raised: "#FFFFFF",
        ink: "#16211C",
        "ink-soft": "#57635B",
        line: "#D7DCD1",
        signal: "#1C6B4F",
        "signal-tint": "#E1EEE6",
        hot: "#B9791C",
        "hot-tint": "#F6E9D2",
        warm: "#8A6D1E",
        "warm-tint": "#F1EBD4",
        miss: "#A23B2E",
        "miss-tint": "#F3E1DD",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
