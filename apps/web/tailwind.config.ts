import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#161616",
        surface: "#1f1f1f",
        surface2: "#262626",
        line: "#2e2e2e",
        fg: "#f5f5f5",
        muted: "#9a9a9a",
        dim: "#6b6b6b",
        ok: "#7ee2a8",
        warn: "#f2c66d",
        bad: "#f28b82",
      },
      fontFamily: {
        sans: ["var(--font-work)", "Work Sans", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "Azeret Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
