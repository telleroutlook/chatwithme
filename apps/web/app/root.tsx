import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { LinksFunction } from 'react-router';
import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import './styles/globals.css';
import { useAuthStore } from './stores/auth';
import { useThemeStore } from './stores/theme';
import { useChatStore } from './stores/chat';
import { queryClient } from './lib/queryClient';
import { initPerformanceMonitoring } from './lib/performance';
import { registerSW } from './lib/serviceWorker';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { OfflineIndicator } from './components/OfflineIndicator';

const themeBootScript = `
(() => {
  const key = 'chatwithme-theme';
  let mode = 'system';
  try {
    if (typeof window !== 'undefined') {
      const saved = JSON.parse(window.localStorage.getItem(key) || '{}');
      if (saved && (saved.state?.mode === 'light' || saved.state?.mode === 'dark' || saved.state?.mode === 'system')) {
        mode = saved.state.mode;
      }
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
      document.documentElement.classList.toggle('dark', resolved === 'dark');
      document.documentElement.dataset.theme = resolved;
    }
  } catch {}
})();
`;

export const links: LinksFunction = () => [
  // Font preloading for critical above-the-fold content
  {
    rel: 'preload',
    href: '/fonts/manrope-400.woff2',
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'preload',
    href: '/fonts/manrope-500.woff2',
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'preload',
    href: '/fonts/manrope-700.woff2',
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  },
  // Preconnect to API origin for faster fetch requests
  {
    rel: 'preconnect',
    href: import.meta.env.VITE_API_URL || 'http://localhost:8787',
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
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
  const isOnline = useOnlineStatus();

  useEffect(() => {
    // Initialize performance monitoring
    initPerformanceMonitoring();

    // Rehydrate stores
    void useAuthStore.persist.rehydrate();
    void useThemeStore.persist.rehydrate();

    // Register service worker
    registerSW({
      onUpdate: () => {
        // Optionally show update notification to user
      },
      onSuccess: () => {
        // Service worker activated successfully
      },
    });
  }, []);

  useEffect(() => {
    // Only access window in client-side
    if (typeof window === 'undefined') return;

    syncThemeWithSystem();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => syncThemeWithSystem();
    media.addEventListener('change', handleSystemThemeChange);
    return () => media.removeEventListener('change', handleSystemThemeChange);
  }, [syncThemeWithSystem]);

  // Update online status in chat store
  useEffect(() => {
    const { setOnlineStatus } = useChatStore.getState();
    setOnlineStatus(isOnline);
  }, [isOnline]);

  return (
    <QueryClientProvider client={queryClient}>
      <OfflineIndicator isOnline={isOnline} />
      <Outlet />
    </QueryClientProvider>
  );
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
