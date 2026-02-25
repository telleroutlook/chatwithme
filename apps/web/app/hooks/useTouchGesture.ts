import { useEffect, useRef } from 'react';

export interface TouchGestureOptions {
  onSwipeRight?: (e: TouchEvent) => void;
  onSwipeLeft?: (e: TouchEvent) => void;
  onSwipeUp?: (e: TouchEvent) => void;
  onSwipeDown?: (e: TouchEvent) => void;
  onLongPress?: (e: TouchEvent) => void;
  longPressDelay?: number;
  swipeThreshold?: number;
  enabled?: boolean;
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  longPressTimer: ReturnType<typeof setTimeout> | null;
}

export function useTouchGesture<T extends HTMLElement>(
  targetRef: React.RefObject<T | null>,
  options: TouchGestureOptions
) {
  const {
    onSwipeRight,
    onSwipeLeft,
    onSwipeUp,
    onSwipeDown,
    onLongPress,
    longPressDelay = 500,
    swipeThreshold = 50,
    enabled = true,
  } = options;

  const touchStateRef = useRef<TouchState>({
    startX: 0,
    startY: 0,
    startTime: 0,
    longPressTimer: null,
  });

  useEffect(() => {
    if (!enabled || !targetRef.current) return;

    const element = targetRef.current;
    const touchState = touchStateRef.current;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      touchState.startX = touch.clientX;
      touchState.startY = touch.clientY;
      touchState.startTime = Date.now();

      // Set up long press timer
      if (onLongPress) {
        touchState.longPressTimer = setTimeout(() => {
          onLongPress(e);
        }, longPressDelay);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Clear long press timer if moved significantly
      if (touchState.longPressTimer) {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - touchState.startX);
        const deltaY = Math.abs(touch.clientY - touchState.startY);

        if (deltaX > 10 || deltaY > 10) {
          clearTimeout(touchState.longPressTimer);
          touchState.longPressTimer = null;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      // Clear long press timer
      if (touchState.longPressTimer) {
        clearTimeout(touchState.longPressTimer);
        touchState.longPressTimer = null;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchState.startX;
      const deltaY = touch.clientY - touchState.startY;
      const deltaTime = Date.now() - touchState.startTime;

      // Require quick swipe (under 300ms) for better UX
      if (deltaTime > 300) return;

      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      // Determine if horizontal or vertical swipe
      if (Math.max(absDeltaX, absDeltaY) < swipeThreshold) return;

      if (absDeltaX > absDeltaY) {
        // Horizontal swipe
        if (deltaX > 0 && onSwipeRight) {
          onSwipeRight(e);
        } else if (deltaX < 0 && onSwipeLeft) {
          onSwipeLeft(e);
        }
      } else {
        // Vertical swipe
        if (deltaY > 0 && onSwipeDown) {
          onSwipeDown(e);
        } else if (deltaY < 0 && onSwipeUp) {
          onSwipeUp(e);
        }
      }
    };

    // Use passive: false for better compatibility with preventDefault
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    element.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchEnd);

      if (touchState.longPressTimer) {
        clearTimeout(touchState.longPressTimer);
      }
    };
  }, [
    enabled,
    onSwipeRight,
    onSwipeLeft,
    onSwipeUp,
    onSwipeDown,
    onLongPress,
    longPressDelay,
    swipeThreshold,
    targetRef,
  ]);
}

/**
 * Hook for edge swipe gestures (swipe from left/right edge of screen)
 */
export function useEdgeSwipe(options: {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  edgeThreshold?: number;
  enabled?: boolean;
}) {
  const { onSwipeRight, onSwipeLeft, edgeThreshold = 30, enabled = true } = options;
  const touchStartRef = useRef<{ x: number; fromEdge: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const screenWidth = window.innerWidth;

      // Check if touch is near left or right edge
      const fromLeftEdge = touch.clientX <= edgeThreshold;
      const fromRightEdge = touch.clientX >= screenWidth - edgeThreshold;

      if (fromLeftEdge || fromRightEdge) {
        touchStartRef.current = {
          x: touch.clientX,
          fromEdge: true,
        };
      } else {
        touchStartRef.current = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current?.fromEdge) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;

      // Right swipe from left edge
      if (deltaX > 50 && onSwipeRight) {
        onSwipeRight();
        touchStartRef.current = null;
      }
      // Left swipe from right edge
      else if (deltaX < -50 && onSwipeLeft) {
        onSwipeLeft();
        touchStartRef.current = null;
      }
    };

    const handleTouchEnd = () => {
      touchStartRef.current = null;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [enabled, onSwipeRight, onSwipeLeft, edgeThreshold]);
}
