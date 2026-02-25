import { Copy, Trash2, RefreshCw, Check, X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { copyToClipboard } from '~/lib/clipboard';

export interface MessageActionsProps {
  messageId: string;
  content: string;
  onCopy?: () => void;
  onRegenerate?: () => void;
  onDelete?: () => void;
  position: { x: number; y: number };
  onClose: () => void;
}

export function MessageActions({
  messageId,
  content,
  onCopy,
  onRegenerate,
  onDelete,
  position,
  onClose,
}: MessageActionsProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [onClose]);

  const handleCopy = async () => {
    const success = await copyToClipboard(content);
    if (success) {
      setCopied(true);
      onCopy?.();
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 1000);
    }
  };

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  // Prevent menu from going off-screen
  const adjustPosition = () => {
    const menuWidth = 200; // Approximate menu width
    const menuHeight = onRegenerate && onDelete ? 160 : onRegenerate || onDelete ? 110 : 60;

    let x = position.x;
    let y = position.y;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 16;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 16;
    }
    if (x < 16) x = 16;
    if (y < 16) y = 16;

    return { x, y };
  };

  const adjustedPosition = adjustPosition();

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] max-w-[220px] rounded-lg border border-border bg-popover p-1 shadow-lg animate-in fade-in zoom-in-95 duration-200"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
    >
      {/* Copy button */}
      <button
        onClick={handleCopy}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm',
          'hover:bg-accent active:bg-accent/80',
          'transition-colors'
        )}
        aria-label={copied ? 'Copied to clipboard' : 'Copy message to clipboard'}
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
        <span>{copied ? 'Copied!' : 'Copy'}</span>
      </button>

      {/* Regenerate button (assistant messages only) */}
      {onRegenerate && (
        <button
          onClick={() => handleAction(onRegenerate)}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm',
            'hover:bg-accent active:bg-accent/80',
            'transition-colors'
          )}
          aria-label="Regenerate response"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Regenerate</span>
        </button>
      )}

      {/* Delete button */}
      {onDelete && (
        <button
          onClick={() => handleAction(onDelete)}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm',
            'text-destructive hover:bg-destructive/10 active:bg-destructive/20',
            'transition-colors'
          )}
          aria-label="Delete message"
        >
          <Trash2 className="h-4 w-4" />
          <span>Delete</span>
        </button>
      )}
    </div>
  );
}

/**
 * Hook to manage message actions menu state
 */
export function useMessageActions() {
  const [activeMenu, setActiveMenu] = useState<{
    messageId: string;
    content: string;
    position: { x: number; y: number };
  } | null>(null);

  const showMenu = (messageId: string, content: string, position: { x: number; y: number }) => {
    setActiveMenu({ messageId, content, position });
  };

  const hideMenu = () => {
    setActiveMenu(null);
  };

  return {
    activeMenu,
    showMenu,
    hideMenu,
  };
}
