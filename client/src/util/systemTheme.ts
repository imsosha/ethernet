import type { ThemeKey } from '../types';

let systemThemeCache: ThemeKey = 'dark';

let themeChangeCallback: ((newTheme: ThemeKey) => void) | undefined;

export function getSystemTheme() {
  return systemThemeCache;
}

function handleSystemThemeChange(e: MediaQueryListEventMap['change']) {
  systemThemeCache = 'dark';

  themeChangeCallback?.(systemThemeCache);
}

export function setSystemThemeChangeCallback(callback: (newTheme: ThemeKey) => void) {
  themeChangeCallback = callback;
}

window.matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', handleSystemThemeChange);
