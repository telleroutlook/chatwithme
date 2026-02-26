import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'chatwithme-theme';

// Safe version that works in SSR
const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const resolveTheme = (mode: ThemeMode, clientMode?: ThemeMode): ResolvedTheme => {
  if (typeof window === 'undefined') return 'light';
  return mode === 'system' ? getSystemTheme() : mode;
};

const applyTheme = (theme: ResolvedTheme) => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.dataset.theme = theme;
};

interface ThemeState {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  syncWithSystem: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      resolvedTheme: 'light',
      setMode: (mode) => {
        const resolvedTheme = resolveTheme(mode);
        set({ mode, resolvedTheme });
        applyTheme(resolvedTheme);
      },
      syncWithSystem: () => {
        const { mode } = get();
        const resolvedTheme = resolveTheme(mode);
        set({ resolvedTheme });
        applyTheme(resolvedTheme);
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      skipHydration: true,
      partialize: (state) => ({ mode: state.mode }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.syncWithSystem();
        }
      },
    }
  )
);
