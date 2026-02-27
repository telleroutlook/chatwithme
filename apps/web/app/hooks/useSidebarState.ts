import { useState, useCallback, useEffect } from 'react';

/**
 * LocalStorage keys for sidebar state
 */
const STORAGE_KEYS = {
  SIDEBAR_WIDTH: 'chatwithme-sidebar-width',
  SIDEBAR_COLLAPSED: 'chatwithme-sidebar-collapsed',
} as const;

/**
 * Sidebar configuration constants
 */
const CONFIG = {
  MIN_WIDTH: 220,
  DEFAULT_WIDTH: 280,
  MAX_WIDTH: 450,
} as const;

/**
 * Return type for useSidebarState hook
 */
export interface UseSidebarStateReturn {
  /** Current width of the sidebar in pixels */
  sidebarWidth: number;
  /** Whether the sidebar is collapsed (width = 0) */
  sidebarCollapsed: boolean;
  /** Whether the sidebar is currently being resized */
  isResizing: boolean;
  /** Update sidebar width */
  setSidebarWidth: (width: number) => void;
  /** Update sidebar collapsed state */
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** Start resizing operation */
  startResizing: (e: React.MouseEvent) => void;
  /** Stop resizing operation */
  stopResizing: () => void;
  /** Handle resize during drag operation */
  resize: (e: MouseEvent) => void;
  /** Toggle sidebar collapsed state */
  toggleSidebar: () => void;
}

/**
 * Load sidebar state from localStorage
 * @returns Object with width and collapsed state
 */
export function loadSidebarState(): { width: number; collapsed: boolean } {
  if (typeof window === 'undefined') {
    return { width: CONFIG.DEFAULT_WIDTH, collapsed: false };
  }

  const savedWidth = localStorage.getItem(STORAGE_KEYS.SIDEBAR_WIDTH);
  const savedCollapsed = localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED);

  return {
    width: savedWidth ? Math.min(parseInt(savedWidth, 10), CONFIG.MAX_WIDTH) : CONFIG.DEFAULT_WIDTH,
    collapsed: savedCollapsed === 'true',
  };
}

/**
 * Save sidebar state to localStorage
 * @param width - Width to save in pixels
 * @param collapsed - Collapsed state to save
 */
export function saveSidebarState(width: number, collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, String(width));
  if (collapsed) {
    localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, 'true');
  } else {
    localStorage.removeItem(STORAGE_KEYS.SIDEBAR_COLLAPSED);
  }
}

/**
 * Hook for managing sidebar state including width, collapse, and resize operations
 *
 * @example
 * ```tsx
 * const { sidebarWidth, sidebarCollapsed, isResizing, startResizing, stopResizing, toggleSidebar } = useSidebarState();
 * ```
 */
export function useSidebarState(): UseSidebarStateReturn {
  const [sidebarWidth, setSidebarWidth] = useState<number>(CONFIG.DEFAULT_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Load sidebar state on mount
  useEffect(() => {
    const { width, collapsed } = loadSidebarState();
    setSidebarWidth(width);
    setSidebarCollapsed(collapsed);
  }, []);

  // Start resizing operation
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // Stop resizing operation and save state
  const stopResizing = useCallback(() => {
    setIsResizing(false);
    saveSidebarState(sidebarWidth, sidebarCollapsed);
  }, [sidebarWidth, sidebarCollapsed]);

  // Handle resize during drag operation
  const resize = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      if (newWidth >= CONFIG.MIN_WIDTH && newWidth <= CONFIG.MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    },
    [isResizing]
  );

  // Attach global mouse event listeners for resize
  useEffect(() => {
    if (!isResizing) return;
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // Toggle sidebar collapsed state
  const toggleSidebar = useCallback(() => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    saveSidebarState(sidebarWidth, newState);
  }, [sidebarCollapsed, sidebarWidth]);

  return {
    sidebarWidth,
    sidebarCollapsed,
    isResizing,
    setSidebarWidth,
    setSidebarCollapsed,
    startResizing,
    stopResizing,
    resize,
    toggleSidebar,
  };
}
