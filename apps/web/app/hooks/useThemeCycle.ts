import { useCallback } from 'react';
import { type ThemeMode, useThemeStore } from '~/stores/theme';

/**
 * Theme mode cycle order: system -> dark -> light -> system ...
 */
const THEME_MODE_ORDER: ThemeMode[] = ['system', 'dark', 'light'];

/**
 * Hook for cycling through theme modes
 *
 * @returns Function to cycle to the next theme mode
 *
 * @example
 * ```tsx
 * const cycleTheme = useThemeCycle();
 * <button onClick={cycleTheme}>Toggle Theme</button>
 * ```
 */
export function useThemeCycle(): () => void {
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();

  return useCallback(() => {
    const currentIndex = THEME_MODE_ORDER.indexOf(themeMode);
    const nextMode = THEME_MODE_ORDER[(currentIndex + 1) % THEME_MODE_ORDER.length];
    setThemeMode(nextMode);
  }, [themeMode, setThemeMode]);
}
