import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Rajdhani"', 'system-ui', 'sans-serif'],
        body: ['"Exo 2"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        background: "#020a14",
        surface: "#071422",
        "surface-elevated": "#0a1a2e",
        border: "rgba(0, 180, 255, 0.08)",
        "border-active": "rgba(0, 210, 255, 0.25)",
        primary: "#00b4ff",
        "primary-hover": "#00dcff",
        "primary-dim": "#0070a0",
        accent: "#00dcff",
        "accent-ultra": "#4dffff",
        "text-primary": "#e0f0ff",
        "text-secondary": "#5a8aaa",
        "text-muted": "#1e3a50",
        success: "#66ffb2",
        warning: "#ffa726",
        error: "#ff5252",
        // Legacy compat
        "JARVIS-bg": "var(--fri-bg)",
        "JARVIS-card": "var(--fri-card)",
        "JARVIS-border": "var(--fri-border)",
        "JARVIS-text": "var(--fri-text)",
        "JARVIS-muted": "var(--fri-text-dim)",
        "JARVIS-accent": "var(--fri-accent)",
        "JARVIS-accent-hover": "var(--fri-accent-bright)",
      },
      animation: {
        "recording-pulse": "recording-pulse 1.5s ease-in-out infinite",
        "waveform-bar": "waveform-bar 0.7s ease-in-out infinite",
        "transcribe-shimmer": "transcribe-shimmer 1s ease-in-out infinite",
        "pulse-soft": "pulse-ring 2s ease-in-out infinite",
        "cursor-blink": "cursor-blink 1s step-end infinite",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "holo-border": "linear-gradient(135deg, rgba(0, 200, 255, 0.2), transparent 40%, transparent 60%, rgba(0, 200, 255, 0.1))",
      },
      boxShadow: {
        "glow-sm": "0 0 10px rgba(0, 180, 255, 0.1)",
        "glow-md": "0 0 20px rgba(0, 180, 255, 0.15), 0 0 40px rgba(0, 180, 255, 0.05)",
        "glow-lg": "0 0 30px rgba(0, 180, 255, 0.2), 0 0 60px rgba(0, 180, 255, 0.08)",
        "glow-accent": "0 0 15px rgba(0, 210, 255, 0.3), 0 0 40px rgba(0, 210, 255, 0.1)",
        "inner-glow": "inset 0 1px 0 rgba(0, 200, 255, 0.08), inset 0 0 20px rgba(0, 180, 255, 0.03)",
      },
      borderRadius: {
        "hud": "6px",
      },
    },
  },
  plugins: [],
};

export default config;
