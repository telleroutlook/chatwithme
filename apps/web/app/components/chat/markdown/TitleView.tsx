/**
 * Title view component for code blocks
 * Displays a card with file icon, filename, language type, and line count
 */

import { memo } from 'react';
import { FileText, ChevronRight } from 'lucide-react';
import { cn } from '~/lib/utils';
import type { CodeBlockMeta } from './types';

export interface TitleViewProps {
  meta: CodeBlockMeta;
  onSwitchToCode: () => void;
}

export const TitleView = memo<TitleViewProps>(({ meta, onSwitchToCode }) => {
  const { filename, displayName, lineCount } = meta;

  return (
    <button
      onClick={onSwitchToCode}
      className={cn(
        'w-full flex items-center justify-between p-4',
        'bg-muted/30 hover:bg-muted/50',
        'transition-colors duration-200',
        'rounded-lg cursor-pointer',
        'group'
      )}
      aria-label={`View code for ${filename}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* File icon */}
        <div
          className={cn(
            'flex items-center justify-center',
            'w-10 h-10 rounded-md',
            'bg-primary/10 text-primary',
            'group-hover:bg-primary/20',
            'transition-colors duration-200'
          )}
        >
          <FileText className="h-5 w-5" />
        </div>

        {/* File info */}
        <div className="min-w-0 text-left">
          <div
            className={cn(
              'truncate text-sm font-medium text-foreground',
              'group-hover:text-primary',
              'transition-colors duration-200'
            )}
          >
            {filename}
          </div>
          <div className="text-xs text-muted-foreground">{displayName}</div>
        </div>
      </div>

      {/* Line count and arrow */}
      <div className="flex items-center gap-3">
        <div className="text-xs text-muted-foreground">
          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
        </div>
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground',
            'group-hover:text-foreground',
            'group-hover:translate-x-0.5',
            'transition-all duration-200'
          )}
        />
      </div>
    </button>
  );
});

TitleView.displayName = 'TitleView';
