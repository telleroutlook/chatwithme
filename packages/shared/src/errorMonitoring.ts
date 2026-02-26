/**
 * Shared Error Monitoring Types
 *
 * These types are shared between client and server
 * to ensure consistent error reporting across the application.
 */

// Error context interface for structured error reporting
export interface ErrorContext {
  // User identification (no sensitive data)
  userId?: string;
  conversationId?: string;

  // React stack trace
  componentStack?: string;

  // Browser context
  userAgent?: string;
  url?: string;

  // Custom tags for filtering/grouping
  tags?: Record<string, string | number | boolean>;

  // Additional metadata
  metadata?: Record<string, unknown>;
}

// Enhanced error interface with additional context
export interface StructuredError {
  message: string;
  name: string;
  stack?: string;
  context?: ErrorContext;
  timestamp: number;
  id: string;
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

// Error report request from client to server
export interface ErrorReportRequest {
  error: StructuredError;
  severity: ErrorSeverity;
  environment: 'development' | 'staging' | 'production';
}

// Error report response from server
export interface ErrorReportResponse {
  success: boolean;
  errorId: string;
  message?: string;
}
