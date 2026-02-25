import { Menu, LogOut, Download, Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '~/components/ui/button';
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
  sidebarCollapsed: boolean;
}

export function Header({
  title,
  userEmail,
  themeMode,
  currentMessagesLength,
  onSidebarToggle,
  onThemeToggle,
  onExport,
  onLogout,
  sidebarCollapsed,
}: HeaderProps) {
  const themeIcon =
    themeMode === 'light' ? <Sun className="h-4 w-4" /> : themeMode === 'dark' ? <Moon className="h-4 w-4" /> : <Monitor className="h-4 w-4" />;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-3 py-2.5 backdrop-blur-xl sm:px-4 sm:py-3">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onSidebarToggle}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="truncate text-sm font-semibold sm:text-base">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <span className="hidden text-sm text-muted-foreground md:block">
          {userEmail}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onThemeToggle}
          title={`Theme: ${themeMode}`}
          aria-label={`Switch theme mode, current: ${themeMode}`}
        >
          {themeIcon}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onExport}
          disabled={currentMessagesLength === 0}
          title="Export chat"
          aria-label="Export chat"
        >
          <Download className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Log out">
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
