type ElectronWindow = Window &
  typeof globalThis & {
    IS_ELECTRON?: boolean;
    termixPlatform?: string;
    electronAPI?: {
      isElectron?: boolean;
    };
  };

/** process.platform as reported by the preload bridge, else "" in a browser. */
function platform(): string {
  if (typeof window === "undefined") return "";
  return (window as ElectronWindow).termixPlatform ?? "";
}

/**
 * True when the window has no native title bar, so the tab strip has to act as
 * one: it carries the drag region, and on macOS it needs a left inset to clear
 * the traffic lights. Read from the user agent rather than the preload bridge so
 * the very first paint is already correct.
 */
export function usesInlineTitleBar(): boolean {
  const os = platform();
  return os === "darwin" || os === "win32";
}

/**
 * Width the tab strip must leave clear for the macOS traffic lights.
 *
 * Three 14px buttons at 20px spacing from a 20px left margin end at ~78px; the
 * rest is breathing room so the first tab is not flush against the green one.
 */
export function titleBarInsetLeft(): number {
  return platform() === "darwin" ? 92 : 0;
}

export function isElectron(): boolean {
  if (typeof window === "undefined") return false;

  const win = window as ElectronWindow;
  const hasISElectron = win.IS_ELECTRON === true;
  const hasElectronAPI = !!win.electronAPI;
  const isElectronProp = win.electronAPI?.isElectron === true;

  return hasISElectron || hasElectronAPI || isElectronProp;
}
