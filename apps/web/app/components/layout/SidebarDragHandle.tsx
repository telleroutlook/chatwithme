import { cn } from '~/lib/utils';

/**
 * Props for SidebarDragHandle component
 */
export interface SidebarDragHandleProps {
  /** Whether the sidebar is collapsed (handle is hidden when collapsed) */
  collapsed: boolean;
  /** Callback when mouse down on drag handle */
  onMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Drag handle for resizable sidebar
 * Appears on desktop when sidebar is not collapsed
 *
 * @example
 * ```tsx
 * <SidebarDragHandle collapsed={sidebarCollapsed} onMouseDown={startResizing} />
 * ```
 */
export function SidebarDragHandle({
  collapsed,
  onMouseDown,
}: SidebarDragHandleProps): React.ReactElement | null {
  if (collapsed) return null;

  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        'hidden lg:flex w-1 hover:w-1.5 active:w-1.5 transition-all',
        'cursor-col-resize items-center justify-center z-40 group -ml-[2px]'
      )}
      data-testid="sidebar-drag-handle"
      aria-label="Resize sidebar"
    >
      <div className="h-10 w-[2px] rounded-full bg-border group-hover:bg-primary/50 group-active:bg-primary transition-colors" />
    </div>
  );
}
