import * as React from 'react';
import { MessageCircle } from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';
import { cn } from '~/lib/utils';

export interface ChatErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  className?: string;
  enableErrorTracking?: boolean;
}

/**
 * Chat-specific error boundary designed to minimize disruption to the chat experience.
 *
 * Features:
 * - Compact inline error display that doesn't break chat flow
 * - Non-intrusive styling
 * - Preserves chat context on error
 *
 * @example
 * ```tsx
 * <ChatErrorBoundary onError={(error) => trackError(error)}>
 *   <MessageList />
 * </ChatErrorBoundary>
 * ```
 */
function ChatErrorFallback({
  error,
  resetError,
  className,
}: {
  error: Error;
  resetError: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mx-auto my-4 flex max-w-md flex-col items-center rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-center',
        className
      )}
    >
      <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10">
        <MessageCircle className="h-4 w-4 text-destructive" />
      </div>

      <p className="text-sm font-medium text-foreground">Unable to display this message</p>

      {error.message && (
        <p className="mt-1.5 max-w-[280px] text-xs text-muted-foreground line-clamp-2">
          {error.message}
        </p>
      )}

      <button
        onClick={resetError}
        className="mt-3.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
        type="button"
      >
        Retry
      </button>
    </div>
  );
}

/**
 * Chat-specific error boundary component.
 *
 * Wraps chat components with graceful error handling that maintains
 * the chat experience even when individual messages fail to render.
 */
export const ChatErrorBoundary = React.memo<ChatErrorBoundaryProps>(
  ({ children, onError, className, enableErrorTracking }) => {
    return (
      <ErrorBoundary
        fallback={(props) => <ChatErrorFallback {...props} className={className} />}
        onError={onError}
        enableErrorTracking={enableErrorTracking}
      >
        {children}
      </ErrorBoundary>
    );
  }
);

ChatErrorBoundary.displayName = 'ChatErrorBoundary';
