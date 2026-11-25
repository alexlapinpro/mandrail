import type { Config } from "tailwindcss";

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.tsx", "./components/**/*.tsx"],
  theme: {
    extend: {
      colors: {
        steel: token("steel"),
        plate: token("plate"),
        sunken: token("sunken"),
        seam: token("seam"),
        paint: token("paint"),
        muted: token("muted"),
        signal: token("signal"),
        pass: token("pass"),
        stop: token("stop"),
        caution: token("caution"),
      },
      fontFamily: { sans: ["var(--font-barlow)", "system-ui", "sans-serif"], sign: ["var(--font-sign)", "var(--font-barlow)", "sans-serif"] },
    },
  },
} satisfies Config;
