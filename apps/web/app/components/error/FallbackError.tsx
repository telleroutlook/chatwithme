import * as React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { cn } from '~/lib/utils';

export interface FallbackErrorProps {
  error: Error;
  resetError: () => void;
  title?: string;
  description?: string;
  showDetails?: boolean;
  className?: string;
}

/**
 * Generic error fallback component with retry functionality.
 *
 * Provides a clean, user-friendly error display with an option to retry.
 * Supports dark mode and follows the app's design system.
 *
 * @example
 * ```tsx
 * <FallbackError
 *   error={error}
 *   resetError={resetError}
 *   title="Failed to load messages"
 *   showDetails
 * />
 * ```
 */
export const FallbackError = React.memo<FallbackErrorProps>(
  ({
    error,
    resetError,
    title = 'Something went wrong',
    description,
    showDetails = false,
    className,
  }) => {
    const [isExpanded, setIsExpanded] = React.useState(false);

    return (
      <Card className={cn('border-destructive/50 bg-destructive/5', className)}>
        <CardContent className="flex flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>

          <h3 className="text-lg font-semibold text-foreground">{title}</h3>

          {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}

          {error.message && !isExpanded && (
            <p className="mt-3 max-w-md text-sm text-muted-foreground">{error.message}</p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={resetError} size="sm" variant="default">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>

            {showDetails && error.stack && (
              <Button
                onClick={() => setIsExpanded((prev) => !prev)}
                size="sm"
                variant="outline"
                type="button"
              >
                {isExpanded ? 'Hide' : 'Show'} Details
              </Button>
            )}
          </div>

          {showDetails && isExpanded && error.stack && (
            <details className="mt-4 w-full max-w-md">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                Error Stack
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                {error.stack}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    );
  }
);

FallbackError.displayName = 'FallbackError';
