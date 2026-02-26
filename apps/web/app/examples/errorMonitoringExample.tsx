/**
 * Error Monitoring Usage Examples
 *
 * This file demonstrates how to use the error monitoring system
 * in various scenarios within the application.
 */

import { useEffect, useState } from 'react';
import { useErrorReporting } from '~/hooks/useErrorReporting';
import { reportError, addBreadcrumb } from '~/lib/errorReporting';

// Example 1: Basic error reporting in a component
export function BasicErrorReporting() {
  const { reportError, addBreadcrumb: addBc } = useErrorReporting({
    componentName: 'BasicErrorReporting',
  });

  const handleClick = () => {
    // Track user action
    addBc('User clicked risky button');

    try {
      // Simulate an error
      throw new Error('Something went wrong!');
    } catch (error) {
      // Report with context
      reportError(error, {
        tags: {
          action: 'click',
          buttonId: 'risky-button',
        },
        metadata: {
          userInput: 'some value',
        },
      });
    }
  };

  return (
    <button type="button" onClick={handleClick}>
      Click to test error reporting
    </button>
  );
}

// Example 2: Async error handling
export function AsyncErrorHandling() {
  const { reportError } = useErrorReporting({
    componentName: 'AsyncErrorHandling',
  });

  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);

    try {
      // Simulate API call
      const response = await fetch('/api/data');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      // Report with request context
      reportError(error, {
        tags: {
          operation: 'fetch',
          endpoint: '/api/data',
        },
        metadata: {
          status: (error as Error).message,
        },
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button" onClick={fetchData} disabled={loading}>
      {loading ? 'Loading...' : 'Fetch data'}
    </button>
  );
}

// Example 3: Error boundary integration
export function ComponentWithErrorBoundary() {
  // Example of how to use with ErrorBoundary
  // <ErrorBoundary onError={(error, errorInfo) => {
  //   reportError(error, {
  //     componentStack: errorInfo.componentStack,
  //     tags: { source: 'error-boundary' }
  //   });
  // }}>
  //   <YourComponent />
  // </ErrorBoundary>

  return <div>Error Boundary Example Component</div>;
}

// Example 4: Manual breadcrumb tracking
export function BreadcrumbTracking() {
  const { addBreadcrumb: trackBreadcrumb } = useErrorReporting({
    componentName: 'BreadcrumbTracking',
  });

  useEffect(() => {
    // Track component lifecycle
    trackBreadcrumb('Component mounted', { timestamp: Date.now() });

    return () => {
      trackBreadcrumb('Component unmounted', { timestamp: Date.now() });
    };
  }, [trackBreadcrumb]);

  const handleFormSubmit = (data: unknown) => {
    // Track form submission
    trackBreadcrumb('Form submitted', {
      formId: 'contact-form',
      hasData: !!data,
    });

    // Submit logic here...
  };

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <button type="submit" onClick={() => handleFormSubmit({ test: 'data' })}>
        Submit
      </button>
    </form>
  );
}

// Example 5: Global error tracking
export function GlobalErrorTracker() {
  useEffect(() => {
    // Initialize error reporting for the entire app
    import('~/lib/errorReporting').then(({ initErrorReporting }) => {
      initErrorReporting({
        service: 'console',
        sampleRate: 1.0,
        maxErrorsPerHour: 100,
      });
    });

    // Track page navigation
    const trackPageView = () => {
      addBreadcrumb({
        message: 'Page view',
        category: 'navigation',
        level: 'info',
        data: {
          path: window.location.pathname,
          search: window.location.search,
        },
      });
    };

    trackPageView();

    // Track navigation changes
    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      originalPushState.apply(history, args);
      trackPageView();
    };

    return () => {
      history.pushState = originalPushState;
    };
  }, []);

  return null;
}

// Example 6: User-specific error tracking
export function UserErrorTracking({ userId }: { userId: string }) {
  const { reportError: reportUserError } = useErrorReporting({
    userId,
    componentName: 'UserErrorTracking',
  });

  const handleUserAction = async (action: string) => {
    try {
      // Perform user action
      await performUserAction(action);
    } catch (error) {
      // Report with user context
      reportUserError(error, {
        tags: {
          userId,
          action,
        },
      });
    }
  };

  async function performUserAction(action: string): Promise<void> {
    // Simulate action
    if (action === 'fail') {
      throw new Error('Action failed');
    }
  }

  return (
    <div>
      <button type="button" onClick={() => handleUserAction('success')}>
        Success Action
      </button>
      <button type="button" onClick={() => handleUserAction('fail')}>
        Failing Action
      </button>
    </div>
  );
}

// Example 7: Error reporting without React
export function vanillaJSErrorReporting() {
  // Direct usage of error reporting functions
  document.getElementById('myButton')?.addEventListener('click', () => {
    try {
      // Do something risky
      riskyOperation();
    } catch (error) {
      reportError(error, {
        tags: {
          source: 'vanilla-js',
          element: 'myButton',
        },
      });
    }
  });

  function riskyOperation(): never {
    throw new Error('Risky operation failed');
  }
}

// Example 8: Error recovery with retry logic
export function ErrorRecoveryExample() {
  const { reportError, addBreadcrumb: trackBreadcrumb } = useErrorReporting({
    componentName: 'ErrorRecoveryExample',
  });

  const [retryCount, setRetryCount] = useState(0);

  const performOperationWithRetry = async (): Promise<void> => {
    try {
      trackBreadcrumb('Attempting operation', { attempt: retryCount + 1 });

      // Perform operation
      await someOperation();
    } catch (error) {
      reportError(error, {
        tags: {
          operation: 'retry-logic',
          attempt: retryCount + 1,
        },
      });

      // Retry logic
      if (retryCount < 3) {
        setRetryCount((prev) => prev + 1);
        setTimeout(
          () => {
            performOperationWithRetry();
          },
          1000 * (retryCount + 1)
        ); // Exponential backoff
      } else {
        // Give up after 3 retries
        reportError(new Error('Max retries exceeded'), {
          tags: {
            operation: 'retry-logic',
            finalAttempt: 'true',
          },
        });
      }
    }
  };

  async function someOperation(): Promise<void> {
    // Simulate operation that might fail
    if (Math.random() > 0.5) {
      throw new Error('Random failure');
    }
  }

  return (
    <button type="button" onClick={performOperationWithRetry}>
      Try operation (may fail)
    </button>
  );
}
