import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  let originalPlatform: string;

  beforeEach(() => {
    // Mock navigator.platform
    originalPlatform = navigator.platform;
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
  });

  it('attaches event listener on mount', () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

    renderHook(() => useKeyboardShortcuts({}));

    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('removes event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    const { unmount } = renderHook(() => useKeyboardShortcuts({}));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  describe('on Mac (metaKey)', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        writable: true,
        configurable: true,
      });
    });

    it('calls newChat callback on Cmd+K', () => {
      const newChat = vi.fn();
      renderHook(() => useKeyboardShortcuts({ newChat }));

      const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
      act(() => {
        document.dispatchEvent(event);
      });

      expect(newChat).toHaveBeenCalled();
    });

    it('prevents default on Cmd+K', () => {
      const newChat = vi.fn();
      renderHook(() => useKeyboardShortcuts({ newChat }));

      const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      act(() => {
        document.dispatchEvent(event);
      });

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('calls showShortcuts callback on Cmd+/', () => {
      const showShortcuts = vi.fn();
      renderHook(() => useKeyboardShortcuts({ showShortcuts }));

      const event = new KeyboardEvent('keydown', { key: '/', metaKey: true });
      act(() => {
        document.dispatchEvent(event);
      });

      expect(showShortcuts).toHaveBeenCalled();
    });
  });

  describe('on Windows/Linux (ctrlKey)', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'platform', {
        value: 'Win32',
        writable: true,
        configurable: true,
      });
    });

    it('calls newChat callback on Ctrl+K', () => {
      const newChat = vi.fn();
      renderHook(() => useKeyboardShortcuts({ newChat }));

      const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
      act(() => {
        document.dispatchEvent(event);
      });

      expect(newChat).toHaveBeenCalled();
    });

    it('calls showShortcuts callback on Ctrl+/', () => {
      const showShortcuts = vi.fn();
      renderHook(() => useKeyboardShortcuts({ showShortcuts }));

      const event = new KeyboardEvent('keydown', { key: '/', ctrlKey: true });
      act(() => {
        document.dispatchEvent(event);
      });

      expect(showShortcuts).toHaveBeenCalled();
    });
  });

  it('calls closeSidebar callback on Escape', () => {
    const closeSidebar = vi.fn();
    renderHook(() => useKeyboardShortcuts({ closeSidebar }));

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(closeSidebar).toHaveBeenCalled();
  });

  it('does not trigger shortcuts when modifier keys are not pressed', () => {
    const newChat = vi.fn();
    const showShortcuts = vi.fn();

    renderHook(() => useKeyboardShortcuts({ newChat, showShortcuts }));

    const kEvent = new KeyboardEvent('keydown', { key: 'k' });
    act(() => {
      document.dispatchEvent(kEvent);
    });

    const slashEvent = new KeyboardEvent('keydown', { key: '/' });
    act(() => {
      document.dispatchEvent(slashEvent);
    });

    expect(newChat).not.toHaveBeenCalled();
    expect(showShortcuts).not.toHaveBeenCalled();
  });

  it('still triggers newChat on Ctrl+K when shift is also pressed', () => {
    // Note: The hook doesn't check for shiftKey, so Ctrl+Shift+K will still trigger
    // This test documents the current behavior
    const newChat = vi.fn();
    renderHook(() => useKeyboardShortcuts({ newChat }));

    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, shiftKey: true });
    act(() => {
      document.dispatchEvent(event);
    });

    // The hook only checks for modKey + key, not if other modifiers are present
    expect(newChat).toHaveBeenCalled();
  });

  it('handles undefined callbacks gracefully', () => {
    expect(() => {
      renderHook(() => useKeyboardShortcuts({}));

      const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
      act(() => {
        document.dispatchEvent(event);
      });
    }).not.toThrow();
  });

  it('updates callbacks when shortcuts change', () => {
    const newChat1 = vi.fn();
    const newChat2 = vi.fn();

    const { rerender } = renderHook(({ shortcuts }) => useKeyboardShortcuts(shortcuts), {
      initialProps: { shortcuts: { newChat: newChat1 } },
    });

    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });

    act(() => {
      document.dispatchEvent(event);
    });

    expect(newChat1).toHaveBeenCalledTimes(1);

    rerender({ shortcuts: { newChat: newChat2 } });

    act(() => {
      document.dispatchEvent(event);
    });

    expect(newChat1).toHaveBeenCalledTimes(1);
    expect(newChat2).toHaveBeenCalledTimes(1);
  });

  it('detects Mac platform correctly', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      writable: true,
      configurable: true,
    });

    const newChat = vi.fn();
    renderHook(() => useKeyboardShortcuts({ newChat }));

    // Should work with metaKey on Mac
    const metaEvent = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    act(() => {
      document.dispatchEvent(metaEvent);
    });

    expect(newChat).toHaveBeenCalledTimes(1);

    // Should not work with ctrlKey on Mac
    const ctrlEvent = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    act(() => {
      document.dispatchEvent(ctrlEvent);
    });

    expect(newChat).toHaveBeenCalledTimes(1); // Still 1, not 2
  });
});
