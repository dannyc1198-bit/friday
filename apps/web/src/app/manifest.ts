import type { MetadataRoute } from "next";

// Makes the dashboard installable to the iPhone home screen ("Add to Home
// Screen" → opens full-screen, no Safari chrome). Proper app icons can be
// dropped in later; favicon is enough to install.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FRIDAY — Daily Dashboard",
    short_name: "FRIDAY",
    description: "Your day, scored. Sleep, training, fuel, money — one coach.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#06121f",
    theme_color: "#00D4FF",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
