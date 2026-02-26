import * as React from 'react';
import { AlertCircle, Send, X, CheckCircle2 } from 'lucide-react';
import { reportError } from '~/lib/errorReporting';

interface ErrorReportProps {
  error: Error;
  componentStack?: string;
  onClose?: () => void;
}

interface ErrorReportState {
  userEmail: string;
  description: string;
  isSubmitting: boolean;
  isSubmitted: boolean;
  errorReportId: string | null;
}

/**
 * ErrorReport Component
 *
 * Allows users to submit detailed error reports with additional context.
 *
 * @example
 * ```tsx
 * <ErrorReport
 *   error={error}
 *   componentStack={errorInfo.componentStack}
 *   onClose={() => setShowErrorReport(false)}
 * />
 * ```
 */
export function ErrorReport({
  error,
  componentStack,
  onClose,
}: ErrorReportProps): React.ReactElement {
  const [state, setState] = React.useState<ErrorReportState>({
    userEmail: '',
    description: '',
    isSubmitting: false,
    isSubmitted: false,
    errorReportId: null,
  });

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setState((prev) => ({ ...prev, isSubmitting: true }));

    try {
      const errorId = reportError(error, {
        componentStack,
        tags: {
          userEmail: state.userEmail || 'anonymous',
          hasDescription: state.description.length > 0,
        },
        metadata: {
          userDescription: state.description,
        },
      });

      setState({
        userEmail: '',
        description: '',
        isSubmitting: false,
        isSubmitted: true,
        errorReportId: errorId,
      });

      // Auto-close after 3 seconds on success
      setTimeout(() => {
        onClose?.();
      }, 3000);
    } catch (submitError) {
      console.error('Failed to submit error report:', submitError);
      setState((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleInputChange =
    (
      field: keyof Pick<ErrorReportState, 'userEmail' | 'description'>
    ): React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement> =>
    (e) => {
      setState((prev) => ({ ...prev, [field]: e.target.value }));
    };

  if (state.isSubmitted) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-green-900 dark:text-green-100">
            Error report submitted successfully
          </p>
          <p className="text-xs text-green-700 dark:text-green-300">
            Report ID: {state.errorReportId}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded text-green-600 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/10">
      <div className="mb-3 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-900 dark:text-red-100">
            Something went wrong
          </h3>
          <p className="mt-1 text-xs text-red-700 dark:text-red-300">
            Help us improve by reporting this issue
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="error-email"
            className="mb-1 block text-xs font-medium text-red-900 dark:text-red-100"
          >
            Email (optional)
          </label>
          <input
            id="error-email"
            type="email"
            value={state.userEmail}
            onChange={handleInputChange('userEmail')}
            placeholder="your@email.com"
            className="w-full rounded-md border-red-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-red-800 dark:bg-gray-900"
          />
        </div>

        <div>
          <label
            htmlFor="error-description"
            className="mb-1 block text-xs font-medium text-red-900 dark:text-red-100"
          >
            What were you doing? (optional)
          </label>
          <textarea
            id="error-description"
            value={state.description}
            onChange={handleInputChange('description')}
            placeholder="Describe what you were doing when this error occurred..."
            rows={3}
            className="w-full rounded-md border-red-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-red-800 dark:bg-gray-900"
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-red-700 dark:text-red-300">
            Error: {error.message || 'Unknown error'}
          </p>
          <button
            type="submit"
            disabled={state.isSubmitting}
            className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
          >
            {state.isSubmitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Report
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
