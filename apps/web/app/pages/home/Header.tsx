import { Menu, LogOut, Download, Moon, Sun, Monitor, Settings } from 'lucide-react';
import { memo } from 'react';
import { Button } from '~/components/ui/button';
import { useTranslation } from '~/i18n';
import type { ThemeMode } from '~/stores/theme';

export interface HeaderProps {
  title: string;
  userEmail?: string;
  themeMode: ThemeMode;
  currentMessagesLength: number;
  onSidebarToggle: () => void;
  onThemeToggle: () => void;
  onExport: () => void;
  onLogout: () => void;
  onSettings: () => void;
  sidebarCollapsed: boolean;
}

export const Header = memo(function Header({
  title,
  userEmail,
  themeMode,
  currentMessagesLength,
  onSidebarToggle,
  onThemeToggle,
  onExport,
  onLogout,
  onSettings,
  sidebarCollapsed,
}: HeaderProps) {
  const { t } = useTranslation();

  const themeIcon =
    themeMode === 'light' ? (
      <Sun className="h-4 w-4" />
    ) : themeMode === 'dark' ? (
      <Moon className="h-4 w-4" />
    ) : (
      <Monitor className="h-4 w-4" />
    );

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-3 py-2.5 backdrop-blur-xl sm:px-4 sm:py-3">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onSidebarToggle}
          title={sidebarCollapsed ? t('chat.header.mobileMenu') : t('chat.sidebar.newChat')}
          aria-label={sidebarCollapsed ? t('chat.header.mobileMenu') : t('chat.sidebar.newChat')}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="truncate text-sm font-semibold sm:text-base">{title}</h1>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <span className="hidden text-sm text-muted-foreground md:block">{userEmail}</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onThemeToggle}
          title={t('settings.theme.title')}
          aria-label={`${t('settings.theme.title')}: ${themeMode}`}
        >
          {themeIcon}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onExport}
          disabled={currentMessagesLength === 0}
          title={t('common.download')}
          aria-label={t('common.download')}
        >
          <Download className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onSettings}
          title={t('common.settings')}
          aria-label={t('common.settings')}
        >
          <Settings className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onLogout} aria-label={t('common.signOut')}>
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
});
