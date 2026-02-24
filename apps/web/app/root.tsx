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
      {/* Sidebar skeleton */}
      <aside className="hidden w-80 border-r border-border p-4 lg:block">
        <div className="space-y-3">
          {/* New chat button */}
          <div className="shimmer h-10 w-full rounded-md bg-muted" />
          {/* Conversation items */}
          <div className="mt-4 space-y-2">
            <div className="shimmer h-12 w-full rounded-md bg-muted" />
            <div className="shimmer h-12 w-[85%] rounded-md bg-muted" />
            <div className="shimmer h-12 w-[90%] rounded-md bg-muted" />
            <div className="shimmer h-12 w-[75%] rounded-md bg-muted" />
          </div>
        </div>
      </aside>

      {/* Main content skeleton */}
      <main className="flex-1 flex flex-col">
        {/* Header skeleton */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-3 py-2.5 backdrop-blur-xl sm:px-4 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="shimmer h-9 w-9 rounded-md bg-muted" />
            <div className="shimmer h-6 w-40 rounded-md bg-muted sm:w-48" />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="shimmer h-9 w-9 rounded-md bg-muted" />
            <div className="shimmer h-9 w-9 rounded-md bg-muted" />
            <div className="shimmer h-9 w-9 rounded-md bg-muted" />
          </div>
        </header>

        {/* Chat messages skeleton */}
        <div className="flex-1 p-4">
          <div className="mx-auto max-w-4xl space-y-4">
            {/* Header skeleton */}
            <div className="shimmer h-10 w-64 rounded-md bg-muted" />
            {/* Message bubbles */}
            <div className="flex gap-3 p-3">
              <div className="shimmer h-9 w-9 shrink-0 rounded-full bg-muted" />
              <div className="shimmer h-24 flex-1 rounded-xl bg-muted sm:max-w-[82%]" />
            </div>
            <div className="flex gap-3 flex-row-reverse p-3">
              <div className="shimmer h-9 w-9 shrink-0 rounded-full bg-muted" />
              <div className="shimmer h-32 flex-1 rounded-xl bg-muted sm:max-w-[88%]" />
            </div>
            <div className="flex gap-3 p-3">
              <div className="shimmer h-9 w-9 shrink-0 rounded-full bg-muted" />
              <div className="shimmer h-20 flex-1 rounded-xl bg-muted sm:max-w-[82%]" />
            </div>
          </div>
        </div>

        {/* Input skeleton */}
        <div className="border-t border-border p-4">
          <div className="mx-auto max-w-4xl">
            <div className="shimmer h-12 w-full rounded-xl bg-muted" />
          </div>
        </div>
      </main>
    </div>
  );
}
