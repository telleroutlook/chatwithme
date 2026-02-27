import { useTranslation } from '../i18n';
import { useAuthStore } from '../stores/auth';
import { useLanguageStore } from '../stores/language';
import { useThemeStore } from '../stores/theme';
import { useNavigate } from 'react-router';
import { api } from '../client';
import type { AppLocale } from '@chatwithme/shared';
import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const locale = useLanguageStore((s) => s.locale);
  const setLocale = useLanguageStore((s) => s.setLocale);
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Redirect if not authenticated
  useEffect(() => {
    if (!useAuthStore.getState().isAuthenticated) {
      navigate('/signin');
    }
  }, [navigate]);

  const handleLanguageChange = async (newLocale: AppLocale) => {
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      // Update local state immediately
      setLocale(newLocale);

      // Update on server
      const response = await api.patch<{ user: { language: string } }>('/auth/me', {
        language: newLocale,
      });

      if (response.success && response.data) {
        // Update user in auth store
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          useAuthStore
            .getState()
            .setAuth({ ...currentUser, language: newLocale }, useAuthStore.getState().tokens!);
        }
        setSaveStatus('success');
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = () => {
    logout();
    navigate('/signin');
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
          </button>
          <h1 className="text-lg font-semibold sm:text-xl">{t('settings.title')}</h1>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-sm text-muted-foreground mb-8">{t('settings.subtitle')}</p>

        {/* Language Section */}
        <section className="mb-8">
          <h2 className="text-base font-medium mb-1">{t('settings.language.title')}</h2>
          <p className="text-sm text-muted-foreground mb-4">{t('settings.language.description')}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => handleLanguageChange('en')}
              disabled={isSaving}
              className={`px-4 py-2 rounded-lg border transition-all ${
                locale === 'en'
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:bg-muted'
              } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => handleLanguageChange('zh')}
              disabled={isSaving}
              className={`px-4 py-2 rounded-lg border transition-all ${
                locale === 'zh'
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:bg-muted'
              } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              中文
            </button>
          </div>
          {saveStatus === 'success' && (
            <p className="text-sm text-green-600 dark:text-green-400 mt-2">
              ✓ {t('settings.profile.saved')}
            </p>
          )}
          {saveStatus === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-2">
              {t('settings.profile.error')}
            </p>
          )}
        </section>

        {/* Theme Section */}
        <section className="mb-8">
          <h2 className="text-base font-medium mb-1">{t('settings.theme.title')}</h2>
          <p className="text-sm text-muted-foreground mb-4">{t('settings.theme.description')}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMode('light')}
              className={`px-4 py-2 rounded-lg border transition-all ${
                mode === 'light'
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {t('settings.theme.light')}
            </button>
            <button
              type="button"
              onClick={() => setMode('dark')}
              className={`px-4 py-2 rounded-lg border transition-all ${
                mode === 'dark'
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {t('settings.theme.dark')}
            </button>
            <button
              type="button"
              onClick={() => setMode('system')}
              className={`px-4 py-2 rounded-lg border transition-all ${
                mode === 'system'
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {t('settings.theme.system')}
            </button>
          </div>
        </section>

        {/* Profile Section */}
        <section className="mb-8">
          <h2 className="text-base font-medium mb-1">{t('settings.profile.title')}</h2>
          <p className="text-sm text-muted-foreground mb-4">{t('settings.profile.description')}</p>
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">{t('settings.profile.email')}</label>
              <p className="text-sm font-medium">{user.email}</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">
                {t('settings.profile.username')}
              </label>
              <p className="text-sm font-medium">{user.username}</p>
            </div>
          </div>
        </section>

        {/* Sign Out */}
        <section className="pt-8 border-t border-border">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full px-4 py-2.5 rounded-lg border border-border hover:bg-muted transition-colors text-sm font-medium"
          >
            {t('settings.actions.signOut')}
          </button>
        </section>
      </div>
    </div>
  );
}
