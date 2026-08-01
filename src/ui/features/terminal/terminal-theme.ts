import { TERMINAL_THEMES } from "@/lib/terminal-themes.ts";
import type { TerminalConfig } from "@/types/index.ts";

// Background/foreground per UI theme for "Termix Default" - must match index.css
const TERMIX_DEFAULT_COLORS: Record<
  string,
  { background: string; foreground: string }
> = {
  dark: { background: "#0c0d0b", foreground: "#fafafa" },
  light: { background: "#ffffff", foreground: "#111210" },
  dracula: { background: "#282a36", foreground: "#f8f8f2" },
  catppuccin: { background: "#1e1e2e", foreground: "#cdd6f4" },
  nord: { background: "#2e3440", foreground: "#eceff4" },
  solarized: { background: "#002b36", foreground: "#839496" },
  "tokyo-night": { background: "#1a1b26", foreground: "#a9b1d6" },
  "one-dark": { background: "#282c34", foreground: "#abb2bf" },
  gruvbox: { background: "#282828", foreground: "#ebdbb2" },
  // Terminal sits on the darkest surface in the ramp, like Termius' console.
  termius: { background: "#0f1520", foreground: "#eef2f7" },
};

/**
 * Theme used by any terminal surface that has no theme of its own — the serial
 * and Docker consoles, and SSH hosts saved before a theme was chosen.
 *
 * Stored client-side, mirroring the existing per-host `terminal_theme_host_*`
 * override, so local and remote consoles stay in step without a round trip.
 * Set it to any key of TERMINAL_THEMES; an unknown value falls back to Termix.
 */
const DEFAULT_TERMINAL_THEME_KEY = "terminal_theme_default";
const BUILT_IN_DEFAULT_TERMINAL_THEME = "phosphorGreen";

export function getDefaultTerminalTheme(): string {
  try {
    const stored = localStorage.getItem(DEFAULT_TERMINAL_THEME_KEY);
    if (stored && (stored === "termix" || TERMINAL_THEMES[stored])) {
      return stored;
    }
  } catch {
    // Private-mode / storage-disabled browsers: fall through to the built-in.
  }
  return BUILT_IN_DEFAULT_TERMINAL_THEME;
}

export function setDefaultTerminalTheme(theme: string): void {
  try {
    localStorage.setItem(DEFAULT_TERMINAL_THEME_KEY, theme);
  } catch {
    // Nothing to do — the built-in default keeps applying.
  }
}

export function resolveTermixThemeColors(
  activeTheme: string,
  appTheme: string,
  customThemeColors?: TerminalConfig["customThemeColors"],
) {
  if (activeTheme === "custom") {
    if (customThemeColors) {
      return customThemeColors;
    }
    return TERMINAL_THEMES.termixDark.colors;
  }
  if (activeTheme !== "termix") {
    return (
      TERMINAL_THEMES[activeTheme]?.colors || TERMINAL_THEMES.termixDark.colors
    );
  }
  let resolvedUiTheme = appTheme;
  if (appTheme === "system") {
    resolvedUiTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  const uiColors =
    TERMIX_DEFAULT_COLORS[resolvedUiTheme] ?? TERMIX_DEFAULT_COLORS.dark;
  const base = TERMINAL_THEMES.termixDark.colors;
  return {
    ...base,
    background: uiColors.background,
    foreground: uiColors.foreground,
    cursor: uiColors.foreground,
    cursorAccent: uiColors.background,
  };
}
