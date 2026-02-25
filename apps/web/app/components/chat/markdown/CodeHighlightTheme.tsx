import { useEffect, useRef } from 'react';
import { useThemeStore } from '~/stores/theme';

const THEME_STYLESHEETS = {
  light: '/node_modules/highlight.js/styles/github-light.css',
  dark: '/node_modules/highlight.js/styles/github-dark.css',
};

export function CodeHighlightTheme() {
  const { resolvedTheme } = useThemeStore();
  const linkRef = useRef<HTMLLinkElement | null>(null);

  useEffect(() => {
    if (!linkRef.current) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.id = 'hljs-theme-stylesheet';
      document.head.appendChild(link);
      linkRef.current = link;
    }

    const link = linkRef.current;
    link.href = THEME_STYLESHEETS[resolvedTheme];
  }, [resolvedTheme]);

  return null;
}
