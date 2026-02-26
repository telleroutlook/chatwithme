/**
 * Error Reporting Service
 *
 * Provides environment-aware error reporting with support for multiple monitoring services.
 * Designed to work with Cloudflare Workers edge environment.
 */

import type { ErrorContext, StructuredError } from '@chatwithme/shared';

// Supported monitoring services
export type MonitoringService = 'sentry' | 'custom' | 'console';

// Monitoring service configuration
interface MonitoringConfig {
  service: MonitoringService;
  endpoint?: string;
  environment?: string;
  release?: string;
  sampleRate?: number;
  maxErrorsPerHour?: number;
}

// Default configuration
const DEFAULT_CONFIG: MonitoringConfig = {
  service: 'console',
  sampleRate: 1.0,
  maxErrorsPerHour: 100,
};

// Get configuration from environment
function getConfig(): MonitoringConfig {
  return {
    service: (import.meta.env.VITE_MONITORING_SERVICE as MonitoringService) || 'console',
    endpoint: import.meta.env.VITE_ERROR_MONITORING_ENDPOINT,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,
    sampleRate: parseFloat(import.meta.env.VITE_ERROR_SAMPLE_RATE || '1.0'),
    maxErrorsPerHour: parseInt(import.meta.env.VITE_ERROR_MAX_PER_HOUR || '100', 10),
  };
}

// Error severity levels
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

// Breadcrumb for error context tracking
export interface Breadcrumb {
  timestamp: number;
  message: string;
  category?: string;
  level?: 'info' | 'warn' | 'error';
  data?: Record<string, unknown>;
}

// Session context for error tracking
interface SessionContext {
  sessionId: string;
  startTime: number;
  breadcrumbs: Breadcrumb[];
  userId?: string;
}

// Global session context
const sessionContext: SessionContext = {
  sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
  startTime: Date.now(),
  breadcrumbs: [],
};

// Error tracking for rate limiting
const errorTracking = {
  counts: new Map<string, number>(),
  lastReset: Date.now(),
};

/**
 * Initialize error reporting service
 */
export function initErrorReporting(config?: Partial<MonitoringConfig>): void {
  const finalConfig = { ...getConfig(), ...config };

  if (finalConfig.service === 'sentry') {
    initSentry(finalConfig);
  }

  // Set up global error handlers
  if (typeof window !== 'undefined') {
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
  }
}

/**
 * Initialize Sentry (if available)
 */
function initSentry(config: MonitoringConfig): void {
  // Dynamically import Sentry only if configured
  if (typeof window !== 'undefined' && window.Sentry) {
    window.Sentry.init({
      dsn: config.endpoint,
      environment: config.environment,
      release: config.release,
      tracesSampleRate: config.sampleRate,
    });
  }
}

/**
 * Handle global errors
 */
function handleGlobalError(event: ErrorEvent): void {
  reportError(event.error, {
    tags: {
      source: 'global',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    },
  });
}

/**
 * Handle unhandled promise rejections
 */
function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  reportError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)), {
    tags: {
      source: 'unhandled_rejection',
    },
  });
}

/**
 * Check if error should be reported based on rate limiting
 */
function shouldReport(errorName: string, config: MonitoringConfig): boolean {
  const now = Date.now();
  const hourInMs = 60 * 60 * 1000;
  const maxPerHour = config.maxErrorsPerHour || DEFAULT_CONFIG.maxErrorsPerHour!;

  // Reset counter if hour has passed
  if (now - errorTracking.lastReset > hourInMs) {
    errorTracking.counts.clear();
    errorTracking.lastReset = now;
  }

  const currentCount = errorTracking.counts.get(errorName) || 0;

  // Check max per hour limit
  if (currentCount >= maxPerHour) {
    return false;
  }

  // Apply sampling rate
  const sampleRate = config.sampleRate || DEFAULT_CONFIG.sampleRate!;
  if (Math.random() > sampleRate) {
    return false;
  }

  // Increment counter
  errorTracking.counts.set(errorName, currentCount + 1);
  return true;
}

/**
 * Report error to monitoring service
 */
export function reportError(error: Error | unknown, context?: ErrorContext): string {
  const config = getConfig();
  const errorObj = error instanceof Error ? error : new Error(String(error));
  const errorName = errorObj.name || 'UnknownError';

  // Check rate limiting
  if (!shouldReport(errorName, config)) {
    return `skipped_${Date.now()}`;
  }

  // Build structured error
  const structuredError: StructuredError = {
    message: errorObj.message,
    name: errorName,
    stack: errorObj.stack,
    context: {
      ...context,
      sessionId: sessionContext.sessionId,
      breadcrumbs: sessionContext.breadcrumbs.slice(-10), // Last 10 breadcrumbs
      environment: config.environment,
      release: config.release,
    },
    timestamp: Date.now(),
    id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
  };

  // Send to monitoring service
  switch (config.service) {
    case 'sentry':
      sendToSentry(structuredError);
      break;
    case 'custom':
      sendToCustomEndpoint(structuredError, config.endpoint);
      break;
    case 'console':
    default:
      sendToConsole(structuredError);
      break;
  }

  return structuredError.id;
}

/**
 * Send error to Sentry
 */
function sendToSentry(structuredError: StructuredError): void {
  if (typeof window !== 'undefined' && window.Sentry) {
    window.Sentry.captureException(structuredError, {
      extra: structuredError.context,
      tags: structuredError.context?.tags,
    });
  }
}

/**
 * Send error to custom endpoint
 */
async function sendToCustomEndpoint(
  structuredError: StructuredError,
  endpoint?: string
): Promise<void> {
  if (!endpoint) {
    console.warn('[Error Reporting] No endpoint configured for custom monitoring service');
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
    console.warn('[Error Reporting] Failed to send error to monitoring:', sendError);
  }
}

/**
 * Send error to console (fallback)
 */
function sendToConsole(structuredError: StructuredError): void {
  if (import.meta.env.DEV) {
    console.error('[Error Report]', structuredError);
  }
}

/**
 * Add breadcrumb for error context
 */
export function addBreadcrumb(breadcrumb: Omit<Breadcrumb, 'timestamp'>): void {
  sessionContext.breadcrumbs.push({
    ...breadcrumb,
    timestamp: Date.now(),
  });

  // Keep only last 50 breadcrumbs
  if (sessionContext.breadcrumbs.length > 50) {
    sessionContext.breadcrumbs.shift();
  }
}

/**
 * Set user context for error reporting
 */
export function setUserContext(userId: string): void {
  sessionContext.userId = userId;
  addBreadcrumb({
    message: 'User context set',
    category: 'user',
    level: 'info',
    data: { userId },
  });
}

/**
 * Get error statistics
 */
export function getErrorStats(): Record<string, number> {
  return Object.fromEntries(errorTracking.counts);
}

/**
 * Clear error tracking
 */
export function clearErrorTracking(): void {
  errorTracking.counts.clear();
  errorTracking.lastReset = Date.now();
}

/**
 * Get session info for debugging
 */
export function getSessionInfo(): SessionContext {
  return { ...sessionContext };
}

/**
 * Clean up error reporting
 */
export function cleanupErrorReporting(): void {
  if (typeof window !== 'undefined') {
    window.removeEventListener('error', handleGlobalError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }
  clearErrorTracking();
  sessionContext.breadcrumbs = [];
}
