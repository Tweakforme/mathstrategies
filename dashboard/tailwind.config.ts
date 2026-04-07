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
        bg:      "#07090f",
        "bg-2":  "#0b0f1a",
        card:    "#0d1117",
        "card-2":"#111827",
        border:  "#1c2333",
        "border-2": "#243047",
        accent:  "#e63946",
        "accent-hover": "#c1121f",
        gold:    "#f59e0b",
        "gold-dim": "#92400e",
        electric:"#06b6d4",
        success: "#10b981",
        muted:   "#64748b",
        subtle:  "#1e2d40",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Inter", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gradient-card": "linear-gradient(135deg, #0d1117 0%, #111827 100%)",
        "gradient-accent": "linear-gradient(135deg, #e63946 0%, #c1121f 100%)",
        "gradient-gold": "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
        "gradient-electric": "linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)",
      },
      boxShadow: {
        "card": "0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)",
        "card-hover": "0 4px 16px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)",
        "accent-glow": "0 0 20px rgba(230,57,70,0.3)",
        "gold-glow": "0 0 20px rgba(245,158,11,0.3)",
        "electric-glow": "0 0 20px rgba(6,182,212,0.2)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};

export default config;
