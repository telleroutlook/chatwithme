import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { LinksFunction } from 'react-router';
import './styles/globals.css';

export const links: LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function HydrateFallback() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';

  if (pathname === '/home') {
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

  if (pathname === '/signin' || pathname === '/signup') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md animate-pulse space-y-4 rounded-xl border border-border p-6">
          <div className="mx-auto h-7 w-40 rounded bg-muted" />
          <div className="mx-auto h-4 w-56 rounded bg-muted" />
          <div className="h-10 w-full rounded bg-muted" />
          <div className="h-10 w-full rounded bg-muted" />
          <div className="h-10 w-full rounded bg-muted" />
          {pathname === '/signup' && <div className="h-10 w-full rounded bg-muted" />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <div className="mx-auto w-full max-w-3xl animate-pulse space-y-4 py-8">
        <div className="h-8 w-40 rounded-md bg-muted" />
        <div className="h-24 w-full rounded-xl bg-muted" />
        <div className="h-24 w-full rounded-xl bg-muted" />
        <div className="h-24 w-2/3 rounded-xl bg-muted" />
      </div>
    </div>
  );
}
