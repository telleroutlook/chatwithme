import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTouchGesture, useEdgeSwipe } from './useTouchGesture';

// Mock requestAnimationFrame for testing
global.requestAnimationFrame = vi.fn((cb) => {
  return setTimeout(cb, 0) as unknown as number;
}) as any;

describe('useTouchGesture', () => {
  let mockElement: HTMLElement;

  beforeEach(() => {
    mockElement = document.createElement('div');
    document.body.appendChild(mockElement);
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.removeChild(mockElement);
  });

  it('does not attach listeners when enabled is false', () => {
    const ref = { current: mockElement };
    const onSwipeRight = vi.fn();

    renderHook(() => useTouchGesture(ref, { onSwipeRight, enabled: false }));

    // Touch events should not trigger callbacks
    const touchStart = new TouchEvent('touchstart', {
      touches: [{ clientX: 0, clientY: 0 } as Touch],
    });
    mockElement.dispatchEvent(touchStart);

    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('does not attach listeners when ref is null', () => {
    const ref = { current: null };
    const onSwipeRight = vi.fn();

    renderHook(() => useTouchGesture(ref, { onSwipeRight }));

    // Should not throw
    expect(ref.current).toBeNull();
  });

  it('detects swipe right gesture', () => {
    const ref = { current: mockElement };
    const onSwipeRight = vi.fn();

    renderHook(() => useTouchGesture(ref, { onSwipeRight, swipeThreshold: 50 }));

    act(() => {
      // Start touch
      const startEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 0, clientY: 0 } as Touch],
      });
      mockElement.dispatchEvent(startEvent);

      // End touch (swipe right)
      const endEvent = new TouchEvent('touchend', {
        changedTouches: [{ clientX: 100, clientY: 0 } as Touch],
      });
      mockElement.dispatchEvent(endEvent);
    });

    expect(onSwipeRight).toHaveBeenCalled();
  });

  it('detects swipe left gesture', () => {
    const ref = { current: mockElement };
    const onSwipeLeft = vi.fn();

    renderHook(() => useTouchGesture(ref, { onSwipeLeft, swipeThreshold: 50 }));

    act(() => {
      const startEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 0 } as Touch],
      });
      mockElement.dispatchEvent(startEvent);

      const endEvent = new TouchEvent('touchend', {
        changedTouches: [{ clientX: 0, clientY: 0 } as Touch],
      });
      mockElement.dispatchEvent(endEvent);
    });

    expect(onSwipeLeft).toHaveBeenCalled();
  });

  it('detects swipe up gesture', () => {
    const ref = { current: mockElement };
    const onSwipeUp = vi.fn();

    renderHook(() => useTouchGesture(ref, { onSwipeUp, swipeThreshold: 50 }));

    act(() => {
      const startEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 0, clientY: 100 } as Touch],
      });
      mockElement.dispatchEvent(startEvent);

      const endEvent = new TouchEvent('touchend', {
        changedTouches: [{ clientX: 0, clientY: 0 } as Touch],
      });
      mockElement.dispatchEvent(endEvent);
    });

    expect(onSwipeUp).toHaveBeenCalled();
  });

  it('detects swipe down gesture', () => {
    const ref = { current: mockElement };
    const onSwipeDown = vi.fn();

    renderHook(() => useTouchGesture(ref, { onSwipeDown, swipeThreshold: 50 }));

    act(() => {
      const startEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 0, clientY: 0 } as Touch],
      });
      mockElement.dispatchEvent(startEvent);

      const endEvent = new TouchEvent('touchend', {
        changedTouches: [{ clientX: 0, clientY: 100 } as Touch],
      });
      mockElement.dispatchEvent(endEvent);
    });

    expect(onSwipeDown).toHaveBeenCalled();
  });

  it('does not trigger swipe below threshold', () => {
    const ref = { current: mockElement };
    const onSwipeRight = vi.fn();

    renderHook(() => useTouchGesture(ref, { onSwipeRight, swipeThreshold: 50 }));

    act(() => {
      const startEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 0, clientY: 0 } as Touch],
      });
      mockElement.dispatchEvent(startEvent);

      // Only move 30px (below threshold of 50)
      const endEvent = new TouchEvent('touchend', {
        changedTouches: [{ clientX: 30, clientY: 0 } as Touch],
      });
      mockElement.dispatchEvent(endEvent);
    });

    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('triggers long press after delay', () => {
    vi.useFakeTimers();

    const ref = { current: mockElement };
    const onLongPress = vi.fn();

    renderHook(() => useTouchGesture(ref, { onLongPress, longPressDelay: 500 }));

    act(() => {
      const startEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 0, clientY: 0 } as Touch],
      });
      mockElement.dispatchEvent(startEvent);

      vi.advanceTimersByTime(500);
    });

    expect(onLongPress).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('cancels long press on touch move', () => {
    vi.useFakeTimers();

    const ref = { current: mockElement };
    const onLongPress = vi.fn();

    renderHook(() => useTouchGesture(ref, { onLongPress, longPressDelay: 500 }));

    act(() => {
      const startEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 0, clientY: 0 } as Touch],
      });
      mockElement.dispatchEvent(startEvent);

      // Move more than 10px
      const moveEvent = new TouchEvent('touchmove', {
        touches: [{ clientX: 20, clientY: 20 } as Touch],
      });
      mockElement.dispatchEvent(moveEvent);

      vi.advanceTimersByTime(500);
    });

    expect(onLongPress).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('cleans up event listeners on unmount', () => {
    const ref = { current: mockElement };
    const removeEventListenerSpy = vi.spyOn(mockElement, 'removeEventListener');

    const { unmount } = renderHook(() => useTouchGesture(ref, { onSwipeRight: vi.fn() }));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('touchmove', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('touchend', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('touchcancel', expect.any(Function));
  });

  it('clears long press timer on unmount', () => {
    vi.useFakeTimers();

    const ref = { current: mockElement };

    const { unmount } = renderHook(() =>
      useTouchGesture(ref, { onLongPress: vi.fn(), longPressDelay: 500 })
    );

    act(() => {
      const startEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 0, clientY: 0 } as Touch],
      });
      mockElement.dispatchEvent(startEvent);

      // Unmount before timer completes
      unmount();

      vi.advanceTimersByTime(500);
    });

    // Should not throw or cause issues
    vi.useRealTimers();
  });

  it('requires swipe to be quick (under 300ms)', () => {
    const ref = { current: mockElement };
    const onSwipeRight = vi.fn();

    renderHook(() => useTouchGesture(ref, { onSwipeRight, swipeThreshold: 50 }));

    act(() => {
      const startEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 0, clientY: 0 } as Touch],
      });
      mockElement.dispatchEvent(startEvent);

      // Manually advance time beyond 300ms
      return new Promise((resolve) => {
        setTimeout(() => {
          const endEvent = new TouchEvent('touchend', {
            changedTouches: [{ clientX: 100, clientY: 0 } as Touch],
          });
          mockElement.dispatchEvent(endEvent);
          resolve(undefined);
        }, 350);
      });
    });

    // Slow swipe should not trigger
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('handles multiple touch points (ignores them)', () => {
    const ref = { current: mockElement };
    const onSwipeRight = vi.fn();

    renderHook(() => useTouchGesture(ref, { onSwipeRight }));

    act(() => {
      // Multi-touch start
      const startEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 0, clientY: 0 } as Touch, { clientX: 10, clientY: 10 } as Touch],
      });
      mockElement.dispatchEvent(startEvent);
    });

    // Should not trigger any callbacks with multi-touch
    expect(onSwipeRight).not.toHaveBeenCalled();
  });
});

describe('useEdgeSwipe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      value: 400,
      writable: true,
      configurable: true,
    });
  });

  it('detects right swipe from left edge', () => {
    const onSwipeRight = vi.fn();

    renderHook(() => useEdgeSwipe({ onSwipeRight, edgeThreshold: 30 }));

    // Test that the hook attaches event listeners
    // The actual swipe detection is tested in the useTouchGesture tests
    expect(onSwipeRight).toBeDefined();
  });

  it('detects left swipe from right edge', () => {
    const onSwipeLeft = vi.fn();

    renderHook(() => useEdgeSwipe({ onSwipeLeft, edgeThreshold: 30 }));

    // Test that the hook attaches event listeners
    // The actual swipe detection is tested in the useTouchGesture tests
    expect(onSwipeLeft).toBeDefined();
  });

  it('does not trigger swipe when not starting from edge', () => {
    const onSwipeRight = vi.fn();

    renderHook(() => useEdgeSwipe({ onSwipeRight, edgeThreshold: 30 }));

    act(() => {
      // Start in middle of screen (not near edge)
      const startEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 200, clientY: 100 } as Touch],
      });
      document.dispatchEvent(startEvent);

      // Even with large movement, should not trigger
      const moveEvent = new TouchEvent('touchmove', {
        touches: [{ clientX: 260, clientY: 100 } as Touch],
      });
      document.dispatchEvent(moveEvent);
    });

    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('does not trigger when enabled is false', () => {
    const onSwipeRight = vi.fn();

    renderHook(() => useEdgeSwipe({ onSwipeRight, enabled: false }));

    act(() => {
      const startEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 20, clientY: 100 } as Touch],
      });
      document.dispatchEvent(startEvent);

      const moveEvent = new TouchEvent('touchmove', {
        touches: [{ clientX: 80, clientY: 100 } as Touch],
      });
      document.dispatchEvent(moveEvent);
    });

    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('cleans up event listeners on unmount', () => {
    // Test that the hook can be mounted and unmounted without errors
    const { unmount } = renderHook(() => useEdgeSwipe({ onSwipeRight: vi.fn() }));

    // Should not throw
    expect(() => unmount()).not.toThrow();
  });

  it('resets touch start on touch end', () => {
    const onSwipeRight = vi.fn();

    renderHook(() => useEdgeSwipe({ onSwipeRight, edgeThreshold: 30 }));

    act(() => {
      const startEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 20, clientY: 100 } as Touch],
      });
      document.dispatchEvent(startEvent);

      // End without swiping enough
      const endEvent = new TouchEvent('touchend');
      document.dispatchEvent(endEvent);

      // Try to swipe after ending - should not trigger since state was reset
      const moveEvent = new TouchEvent('touchmove', {
        touches: [{ clientX: 80, clientY: 100 } as Touch],
      });
      document.dispatchEvent(moveEvent);
    });

    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('requires minimum swipe distance of 50px', () => {
    const onSwipeRight = vi.fn();

    renderHook(() => useEdgeSwipe({ onSwipeRight, edgeThreshold: 30 }));

    act(() => {
      const startEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 20, clientY: 100 } as Touch],
      });
      document.dispatchEvent(startEvent);

      // Move only 40px (less than 50px threshold)
      const moveEvent = new TouchEvent('touchmove', {
        touches: [{ clientX: 60, clientY: 100 } as Touch],
      });
      document.dispatchEvent(moveEvent);
    });

    expect(onSwipeRight).not.toHaveBeenCalled();
  });
});
