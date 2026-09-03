import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { ink: "#0f172a", brand: { DEFAULT: "#7c3aed", soft: "#ede9fe" } } } },
  plugins: [],
} satisfies Config;
