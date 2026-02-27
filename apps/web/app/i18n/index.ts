import { useCallback, useEffect, useState } from 'react';
import { useLanguageStore, type AppLocale } from '../stores/language';
import { en } from './locales/en';
import { zh } from './locales/zh';

// All translations loaded statically
const translations: Record<AppLocale, any> = {
  en,
  zh,
};

/**
 * Deeply get a nested value from an object using dot notation
 * @example getNestedValue(obj, 'a.b.c') -> obj.a.b.c
 */
function getNestedValue(obj: any, path: string): string {
  const keys = path.split('.');
  let result = obj;
  for (const key of keys) {
    if (result == null) return path; // Return key if not found
    result = result[key];
  }
  return typeof result === 'string' ? result : path; // Return key if not a string
}

/**
 * Replace variables in a translation string
 * @example interpolate('Hello {{name}}', { name: 'World' }) -> 'Hello World'
 */
function interpolate(template: string, variables: Record<string, string | number> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return variables[key]?.toString() ?? `{{${key}}}`;
  });
}

/**
 * Get translations for a locale
 */
function getTranslations(locale: AppLocale): any {
  return translations[locale];
}

/**
 * Translation hook
 * @returns { locale, t, changeLocale, isLoading }
 *
 * @example
 * const { t, locale, changeLocale } = useTranslation();
 * <h1>{t('auth.signIn.title')}</h1>
 * <p>{t('time.daysAgo', { days: 3 })}</p>
 */
export function useTranslation() {
  const locale = useLanguageStore((s) => s.locale);
  const setLocale = useLanguageStore((s) => s.setLocale);
  const [isLoading, setIsLoading] = useState(false);

  // Load translations when locale changes
  useEffect(() => {
    // Since we're using static imports, translations are always available
    // Just a small delay to simulate loading for smooth transitions
    setIsLoading(false);
  }, [locale]);

  // Translation function
  const t = useCallback(
    (key: string, variables?: Record<string, string | number>): string => {
      const translations = getTranslations(locale);
      const value = getNestedValue(translations, key);
      return variables ? interpolate(value, variables) : value;
    },
    [locale]
  );

  // Change locale function
  const changeLocale = useCallback(
    async (newLocale: AppLocale) => {
      if (newLocale === locale) return;
      setLocale(newLocale);
    },
    [locale, setLocale]
  );

  return {
    locale,
    t,
    changeLocale,
    isLoading,
  };
}

/**
 * Server-side safe translation function (for SSR)
 * Note: This is a simplified version for SSR compatibility
 */
export function getTranslation(
  locale: AppLocale,
  key: string,
  variables?: Record<string, string | number>
): string {
  const translations = getTranslations(locale);
  const value = getNestedValue(translations, key);
  return variables ? interpolate(value, variables) : value;
}
