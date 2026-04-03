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
        background: "#0a0a0f",
        surface: "#12121a",
        border: "#1e1e2e",
        primary: "#3b82f6",
        "primary-hover": "#2563eb",
        "text-primary": "#f8fafc",
        "text-secondary": "#94a3b8",
        "text-muted": "#64748b",
        success: "#22c55e",
        error: "#3b82f6",
        // JARVIS voice UI tokens (map to CSS variables in globals.css)
        "JARVIS-bg": "var(--JARVIS-bg)",
        "JARVIS-card": "var(--JARVIS-card)",
        "JARVIS-border": "var(--JARVIS-border)",
        "JARVIS-text": "var(--JARVIS-text)",
        "JARVIS-muted": "var(--JARVIS-muted)",
        "JARVIS-accent": "var(--JARVIS-accent)",
        "JARVIS-accent-hover": "var(--JARVIS-accent-hover, #2563eb)",
      },
      animation: {
        "recording-pulse": "recording-pulse 1.5s ease-in-out infinite",
        "waveform-bar": "waveform-bar 0.8s ease-in-out infinite",
        "transcribe-shimmer": "transcribe-shimmer 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
