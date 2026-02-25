import { useEffect } from 'react';

interface KeyboardShortcuts {
  newChat?: () => void;
  showShortcuts?: () => void;
  closeSidebar?: () => void;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + K: New chat
      if (modKey && e.key === 'k') {
        e.preventDefault();
        shortcuts.newChat?.();
      }

      // Cmd/Ctrl + /: Show shortcuts
      if (modKey && e.key === '/') {
        e.preventDefault();
        shortcuts.showShortcuts?.();
      }

      // Escape: Close sidebar/menu
      if (e.key === 'Escape') {
        shortcuts.closeSidebar?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
