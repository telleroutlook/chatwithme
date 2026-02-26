/**
 * Unified logging system with environment-aware levels
 * - debug/info: Only in development
 * - warn/error: Always enabled for monitoring
 */

import type { ErrorContext, StructuredError } from '@chatwithme/shared';

// Error sampling configuration
interface SamplingConfig {
  rate: number; // 0-1, where 1 is 100% sampling
  maxPerHour: number;
}

const DEFAULT_SAMPLING: SamplingConfig = {
  rate: 1.0, // Log all errors by default
  maxPerHour: 100,
};

// Error tracking for sampling
const errorTracker = {
  counts: new Map<string, number>(),
  lastReset: Date.now(),
};

// Generate unique error ID
function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Check if error should be sampled
function shouldSampleError(errorName: string, config: SamplingConfig): boolean {
  const now = Date.now();
  const hourInMs = 60 * 60 * 1000;

  // Reset counter if hour has passed
  if (now - errorTracker.lastReset > hourInMs) {
    errorTracker.counts.clear();
    errorTracker.lastReset = now;
  }

  const currentCount = errorTracker.counts.get(errorName) || 0;

  // Check max per hour limit
  if (currentCount >= config.maxPerHour) {
    return false;
  }

  // Apply sampling rate
  if (Math.random() > config.rate) {
    return false;
  }

  // Increment counter
  errorTracker.counts.set(errorName, currentCount + 1);
  return true;
}

// Get safe user context (removes sensitive data)
function getSafeUserContext(): Partial<ErrorContext> {
  if (typeof window === 'undefined') {
    return {};
  }

  return {
    url: window.location.href,
    userAgent: navigator.userAgent,
  };
}

// Format error for logging
function formatStructuredError(error: Error | unknown, context?: ErrorContext): StructuredError {
  const errorObj = error instanceof Error ? error : new Error(String(error));

  return {
    message: errorObj.message,
    name: errorObj.name,
    stack: errorObj.stack,
    context: {
      ...getSafeUserContext(),
      ...context,
    },
    timestamp: Date.now(),
    id: generateErrorId(),
  };
}

// Send error to monitoring service (placeholder for Sentry, etc.)
async function sendToMonitoring(structuredError: StructuredError): Promise<void> {
  const endpoint = import.meta.env.VITE_ERROR_MONITORING_ENDPOINT;

  if (!endpoint) {
    // No endpoint configured, just log to console
    return;
  }

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(structuredError),
    });
  } catch (sendError) {
    // Fail silently to avoid infinite error loops
    console.warn('[Logger] Failed to send error to monitoring:', sendError);
  }
}

// Enhanced logger with structured error monitoring
export const logger = {
  debug: (...args: unknown[]) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[Debug]', ...args);
    }
  },

  info: (...args: unknown[]) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info('[Info]', ...args);
    }
  },

  warn: (...args: unknown[]) => {
    console.warn('[Warn]', ...args);
  },

  error: (error: Error | unknown, context?: ErrorContext) => {
    const structuredError = formatStructuredError(error, context);

    // Always log to console
    console.error('[Error]', structuredError);

    // In production, send to monitoring service
    if (!import.meta.env.DEV) {
      // Apply sampling
      if (shouldSampleError(structuredError.name, DEFAULT_SAMPLING)) {
        void sendToMonitoring(structuredError);
      }
    }
  },
};

// Error reporting utility for manual error reporting
export function reportError(error: Error | unknown, context?: ErrorContext): string {
  const structuredError = formatStructuredError(error, context);
  logger.error(error, context);
  return structuredError.id;
}

// Re-export types for convenience
export type { ErrorContext, StructuredError };

// Get error statistics
export function getErrorStats(): Record<string, number> {
  return Object.fromEntries(errorTracker.counts);
}

// Reset error tracking
export function resetErrorTracking(): void {
  errorTracker.counts.clear();
  errorTracker.lastReset = Date.now();
}
