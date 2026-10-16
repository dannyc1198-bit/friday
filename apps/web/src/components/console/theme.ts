export const THEME_KEY = "friday-theme";

export type ThemeName = "light" | "dark";

export function readTheme(): ThemeName {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

export function applyTheme(theme: ThemeName): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme !== "light");
  root.classList.toggle("light", theme === "light");
  window.localStorage.setItem(THEME_KEY, theme);
}
