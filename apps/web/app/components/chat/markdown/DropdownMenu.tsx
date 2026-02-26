/**
 * Dropdown menu component for download options
 * Supports multiple download formats with click-outside-to-close
 */

import { memo, useRef, useEffect, useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { cn } from '~/lib/utils';
import type { DownloadOption } from './types';

export interface DropdownMenuProps {
  options: DownloadOption[];
  buttonLabel?: string;
  buttonClassName?: string;
}

export const DropdownMenu = memo<DropdownMenuProps>(({ options, buttonLabel, buttonClassName }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleOptionClick = async (option: DownloadOption) => {
    setIsOpen(false);
    try {
      await option.action();
    } catch (error) {
      console.error('[DropdownMenu] Download option error:', error);
    }
  };

  if (options.length === 0) {
    return null;
  }

  // Single option: show as direct button
  if (options.length === 1) {
    const option = options[0];
    return (
      <button
        onClick={() => void handleOptionClick(option)}
        className={cn(
          'p-1.5 text-muted-foreground hover:text-foreground',
          'bg-muted/50 hover:bg-muted',
          'rounded-md transition-all',
          buttonClassName
        )}
        title={option.label}
        aria-label={option.label}
      >
        {option.icon}
      </button>
    );
  }

  // Multiple options: show dropdown
  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1',
          'p-1.5 text-muted-foreground hover:text-foreground',
          'bg-muted/50 hover:bg-muted',
          'rounded-md transition-all',
          buttonClassName
        )}
        title={buttonLabel || 'Download options'}
        aria-label={buttonLabel || 'Download options'}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <Download className="h-4 w-4" />
        {options.length > 1 && (
          <ChevronDown
            className={cn('h-3 w-3 transition-transform duration-200', isOpen && 'rotate-180')}
          />
        )}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className={cn(
            'absolute right-0 top-full mt-1 z-50',
            'min-w-[200px]',
            'bg-background border border-border',
            'rounded-md shadow-lg',
            'overflow-hidden'
          )}
          role="menu"
          aria-orientation="vertical"
        >
          {options.map((option) => (
            <button
              key={option.id}
              onClick={() => void handleOptionClick(option)}
              className={cn(
                'w-full flex items-center gap-2',
                'px-3 py-2',
                'text-left text-sm',
                'hover:bg-muted',
                'transition-colors',
                'text-foreground'
              )}
              role="menuitem"
            >
              <span className="text-muted-foreground">{option.icon}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

DropdownMenu.displayName = 'DropdownMenu';
