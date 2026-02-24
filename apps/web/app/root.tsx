import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { LinksFunction } from 'react-router';
import { useEffect } from 'react';
import './styles/globals.css';
import { useAuthStore } from './stores/auth';
import { useThemeStore } from './stores/theme';

const themeBootScript = `
(() => {
  const key = 'chatwithme-theme';
  let mode = 'system';
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || '{}');
    if (saved && (saved.state?.mode === 'light' || saved.state?.mode === 'dark' || saved.state?.mode === 'system')) {
      mode = saved.state.mode;
    }
  } catch {}
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.dataset.theme = resolved;
})();
`;

export const links: LinksFunction = () => [];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased" suppressHydrationWarning>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const syncThemeWithSystem = useThemeStore((s) => s.syncWithSystem);

  useEffect(() => {
    void useAuthStore.persist.rehydrate();
    void useThemeStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    syncThemeWithSystem();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => syncThemeWithSystem();
    media.addEventListener('change', handleSystemThemeChange);
    return () => media.removeEventListener('change', handleSystemThemeChange);
  }, [syncThemeWithSystem]);

  return <Outlet />;
}

export function HydrateFallback() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-80 border-r border-border p-4 lg:block">
        <div className="animate-pulse space-y-3">
          <div className="h-10 w-full rounded-md bg-muted" />
          <div className="h-8 w-2/3 rounded-md bg-muted" />
          <div className="h-8 w-4/5 rounded-md bg-muted" />
          <div className="h-8 w-3/5 rounded-md bg-muted" />
        </div>
      </aside>
      <main className="flex-1 p-4">
        <div className="mx-auto max-w-4xl animate-pulse space-y-4">
          <div className="h-10 w-64 rounded-md bg-muted" />
          <div className="h-28 w-full rounded-xl bg-muted" />
          <div className="h-28 w-5/6 rounded-xl bg-muted" />
          <div className="h-28 w-3/4 rounded-xl bg-muted" />
          <div className="h-12 w-full rounded-xl bg-muted" />
        </div>
      </main>
    </div>
  );
}
