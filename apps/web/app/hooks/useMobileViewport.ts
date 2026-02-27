import { useEffect } from 'react';

/**
 * Hook for handling mobile viewport adaptation using Visual Viewport API
 * Sets CSS custom property for visual viewport height to handle mobile keyboard
 *
 * @example
 * ```tsx
 * useMobileViewport();
 * // CSS: height: var(--visual-viewport-height, 100vh);
 * ```
 */
export function useMobileViewport(): void {
  useEffect(() => {
    if (typeof window === 'undefined' || !('visualViewport' in window)) return;

    const viewport = window.visualViewport!;
    const handleResize = () => {
      // Set CSS custom property for visual viewport height
      document.documentElement.style.setProperty(
        '--visual-viewport-height',
        `${viewport.height}px`
      );
    };

    // Initial set
    handleResize();

    viewport.addEventListener('resize', handleResize);
    return () => viewport.removeEventListener('resize', handleResize);
  }, []);
}
