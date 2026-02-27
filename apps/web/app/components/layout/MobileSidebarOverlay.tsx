/**
 * Props for MobileSidebarOverlay component
 */
export interface MobileSidebarOverlayProps {
  /** Whether the overlay is visible */
  isOpen: boolean;
  /** Callback when overlay is clicked */
  onClick: () => void;
}

/**
 * Overlay backdrop for mobile sidebar
 * Appears when sidebar is open on mobile devices
 *
 * @example
 * ```tsx
 * <MobileSidebarOverlay isOpen={sidebarOpen} onClick={() => setSidebarOpen(false)} />
 * ```
 */
export function MobileSidebarOverlay({
  isOpen,
  onClick,
}: MobileSidebarOverlayProps): React.ReactElement | null {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
      onClick={onClick}
      aria-hidden="true"
      data-testid="mobile-sidebar-overlay"
    />
  );
}
