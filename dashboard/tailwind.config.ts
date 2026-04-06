import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // UFC dark theme palette
        bg:      "#0f0f0f",
        card:    "#1a1a1a",
        border:  "#2a2a2a",
        accent:  "#e63946",
        "accent-hover": "#c1121f",
        muted:   "#6b7280",
        subtle:  "#374151",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
