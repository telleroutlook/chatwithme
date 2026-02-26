/**
 * React Hook for Error Reporting
 *
 * Simplifies error reporting integration in React components.
 */

import { useCallback, useEffect } from 'react';
import {
  reportError,
  addBreadcrumb,
  setUserContext,
  initErrorReporting,
} from '~/lib/errorReporting';
import type { ErrorContext } from '@chatwithme/shared';

interface UseErrorReportingOptions {
  userId?: string;
  componentName?: string;
}

interface ErrorReportingReturn {
  reportError: (error: Error | unknown, context?: ErrorContext) => string;
  addBreadcrumb: (message: string, data?: Record<string, unknown>) => void;
}

/**
 * Hook for error reporting in React components
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { reportError, addBreadcrumb } = useErrorReporting({
 *     userId: 'user-123',
 *     componentName: 'MyComponent',
 *   });
 *
 *   const handleClick = () => {
 *     addBreadcrumb('Button clicked', { buttonId: 'submit' });
 *     try {
 *       // risky operation
 *     } catch (error) {
 *       reportError(error, { tags: { action: 'click' } });
 *     }
 *   };
 *
 *   return <button onClick={handleClick}>Submit</button>;
 * }
 * ```
 */
export function useErrorReporting(options: UseErrorReportingOptions = {}): ErrorReportingReturn {
  const { userId, componentName } = options;

  // Initialize error reporting on mount
  useEffect(() => {
    initErrorReporting();

    // Set user context if provided
    if (userId) {
      setUserContext(userId);
    }

    // Add component mount breadcrumb
    if (componentName) {
      addBreadcrumb({
        message: `Component mounted: ${componentName}`,
        category: 'lifecycle',
        level: 'info',
      });
    }

    return () => {
      // Add component unmount breadcrumb
      if (componentName) {
        addBreadcrumb({
          message: `Component unmounted: ${componentName}`,
          category: 'lifecycle',
          level: 'info',
        });
      }

      // Note: Don't cleanup on unmount as other components may still need it
      // cleanupErrorReporting();
    };
  }, [userId, componentName]);

  // Enhanced reportError with component context
  const handleError = useCallback(
    (error: Error | unknown, context?: ErrorContext) => {
      return reportError(error, {
        ...context,
        tags: {
          ...context?.tags,
          componentName,
        },
      });
    },
    [componentName]
  );

  // Enhanced addBreadcrumb with component context
  const handleAddBreadcrumb = useCallback(
    (message: string, data?: Record<string, unknown>) => {
      addBreadcrumb({
        message,
        category: componentName ? 'component' : 'custom',
        level: 'info',
        data: {
          ...data,
          componentName,
        },
      });
    },
    [componentName]
  );

  return {
    reportError: handleError,
    addBreadcrumb: handleAddBreadcrumb,
  };
}

/**
 * Hook for automatic error boundary integration
 */
export function useErrorBoundaryReporting() {
  const { reportError } = useErrorReporting();

  const handleError = useCallback(
    (error: Error, errorInfo: { componentStack?: string }) => {
      return reportError(error, {
        componentStack: errorInfo.componentStack,
        tags: {
          source: 'error-boundary',
        },
      });
    },
    [reportError]
  );

  return { handleError };
}
