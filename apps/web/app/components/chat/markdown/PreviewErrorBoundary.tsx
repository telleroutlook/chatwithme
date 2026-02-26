/**
 * Preview error boundary component
 * Catches preview rendering errors and provides a fallback UI
 */

import { Component, ReactNode } from 'react';
import { AlertCircle, Code } from 'lucide-react';
import { cn } from '~/lib/utils';

export interface PreviewErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onViewCode?: () => void;
}

export interface PreviewErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class PreviewErrorBoundary extends Component<
  PreviewErrorBoundaryProps,
  PreviewErrorBoundaryState
> {
  constructor(props: PreviewErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): PreviewErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    // Log error for debugging
    console.error('[PreviewErrorBoundary] Preview rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className={cn(
          'flex flex-col items-center justify-center',
          'p-8 gap-4',
          'bg-destructive/5 border border-destructive/20',
          'rounded-lg',
          'min-h-[200px]'
        )}>
          <div className={cn(
            'flex items-center gap-2',
            'text-destructive'
          )}>
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-medium">
              Preview failed
            </span>
          </div>

          <p className="text-sm text-muted-foreground text-center max-w-md">
            An error occurred while rendering the preview.
          </p>

          {this.props.onViewCode && (
            <button
              onClick={this.props.onViewCode}
              className={cn(
                'flex items-center gap-2',
                'px-4 py-2',
                'bg-primary text-primary-foreground',
                'rounded-md',
                'hover:bg-primary/90',
                'transition-colors',
                'text-sm font-medium'
              )}
              aria-label="View code instead"
            >
              <Code className="h-4 w-4" />
              View Code
            </button>
          )}

          {this.state.error && process.env.NODE_ENV === 'development' && (
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer">
                Error details
              </summary>
              <pre className="mt-2 text-xs text-destructive overflow-auto max-h-32 p-2 bg-destructive/10 rounded">
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Functional wrapper for the error boundary
 */
export const withPreviewErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  onViewCode?: () => void
) => {
  return (props: P) => (
    <PreviewErrorBoundary onViewCode={onViewCode}>
      <Component {...props} />
    </PreviewErrorBoundary>
  );
};
