/**
 * Offline Indicator Component
 *
 * Shows a banner when the user is offline, indicating that
 * changes will sync when they reconnect.
 */

import { useEffect, useState } from 'react';
import { cn } from '~/lib/utils';

interface OfflineIndicatorProps {
  isOnline: boolean;
}

export function OfflineIndicator({ isOnline }: OfflineIndicatorProps) {
  const [showBanner, setShowBanner] = useState(!isOnline);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setShowBanner(true);
      setIsAnimating(true);
    } else if (showBanner) {
      // Animate out when coming back online
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setShowBanner(false);
      }, 300); // Match CSS transition duration
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  if (!showBanner) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-50 bg-amber-500 dark:bg-amber-600 text-white px-4 py-2 text-sm font-medium transition-transform duration-300 ease-in-out',
        isAnimating ? 'translate-y-0' : '-translate-y-full'
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-center gap-2">
        <svg
          className="h-4 w-4 animate-pulse"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
          />
        </svg>
        <span>You&apos;re offline. Changes will sync when you reconnect.</span>
      </div>
    </div>
  );
}
