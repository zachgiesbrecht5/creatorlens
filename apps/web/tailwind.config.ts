import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f7f7f8",
        surface: "#ffffff",
        surface2: "#f1f2f4",
        line: "#e4e6ea",
        line2: "#cfd3d9",
        fg: "#0b0d12",
        muted: "#5b6472",
        dim: "#8b93a1",
        accent: "#2f5bff",
        accent2: "#1d3fd6",
        accentSoft: "#e9eeff",
        ok: "#12854f",
        okSoft: "#e3f5ec",
        warn: "#b26a00",
        warnSoft: "#fff3dd",
        bad: "#c8362e",
        badSoft: "#fdebea",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,13,18,0.04), 0 0 0 1px rgba(11,13,18,0.04)",
        pop: "0 12px 32px -8px rgba(11,13,18,0.18), 0 0 0 1px rgba(11,13,18,0.06)",
        focus: "0 0 0 3px rgba(47,91,255,0.18)",
      },
      keyframes: {
        sweep: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(300%)" } },
      },
      animation: { sweep: "sweep 1.6s ease-in-out infinite" },
    },
  },
  plugins: [],
} satisfies Config;
