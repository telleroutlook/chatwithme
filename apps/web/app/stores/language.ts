import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppLocale = 'en' | 'zh';

const LANGUAGE_STORAGE_KEY = 'chatwithme-language';

interface LanguageState {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  syncWithUser: (userLocale?: string) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      locale: 'en',
      setLocale: (locale) => {
        set({ locale });
        // Update html lang attribute
        if (typeof document !== 'undefined') {
          document.documentElement.lang = locale;
        }
      },
      syncWithUser: (userLocale) => {
        // Only update if user has a preference and it differs from current
        if (userLocale && (userLocale === 'en' || userLocale === 'zh')) {
          const currentLocale = get().locale;
          if (currentLocale !== userLocale) {
            get().setLocale(userLocale);
          }
        }
      },
    }),
    {
      name: LANGUAGE_STORAGE_KEY,
      skipHydration: true,
      partialize: (state) => ({ locale: state.locale }),
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== 'undefined') {
          document.documentElement.lang = state.locale;
        }
      },
    }
  )
);
