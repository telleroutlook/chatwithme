import { useEffect, useRef, useState, useCallback } from 'react';

export interface PullToRefreshOptions {
  onRefresh: () => void | Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

export function usePullToRefresh(options: PullToRefreshOptions) {
  const { onRefresh, threshold = 80, disabled = false } = options;

  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [canRefresh, setCanRefresh] = useState(false);

  const touchStartRef = useRef<{ y: number; scrollTop: number } | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled) return;

      const scrollContainer = containerRef.current?.closest(
        '[data-radix-scroll-area-viewport]'
      ) as HTMLElement;
      const scrollTop = scrollContainer?.scrollTop ?? 0;

      // Only trigger if at the top of the scroll
      if (scrollTop <= 0) {
        touchStartRef.current = {
          y: e.touches[0].clientY,
          scrollTop,
        };
        setCanRefresh(true);
      }
    },
    [disabled]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (disabled || !touchStartRef.current || !canRefresh) return;

      const currentY = e.touches[0].clientY;
      const deltaY = currentY - touchStartRef.current.y;

      // Only pull down (positive delta)
      if (deltaY > 0) {
        e.preventDefault();
        setIsPulling(true);

        // Use resistance formula for smoother feel
        const resistance = 0.4;
        const distance = Math.min(deltaY * resistance, threshold * 1.5);
        setPullDistance(distance);
      } else {
        setIsPulling(false);
        setPullDistance(0);
      }
    },
    [disabled, canRefresh, threshold]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!touchStartRef.current) return;

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(0);
      setIsPulling(false);

      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    } else {
      setPullDistance(0);
      setIsPulling(false);
    }

    touchStartRef.current = null;
    setCanRefresh(false);
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  useEffect(() => {
    if (disabled) return;

    const element = containerRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    element.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [disabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    containerRef,
    isPulling,
    pullDistance,
    isRefreshing,
    pullProgress: Math.min(pullDistance / threshold, 1),
  };
}
