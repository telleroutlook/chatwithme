/**
 * Retry configuration for API requests with exponential backoff
 */
export const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504] as const,
} as const;

/**
 * Retry configuration override interface
 */
export interface RetryConfigOverride {
  maxRetries?: number;
  initialDelay?: number;
  retryableStatusCodes?: readonly number[];
}

/**
 * Retry result interface
 */
export interface RetryResult<T> {
  data: T;
  attempts: number;
}

/**
 * Calculate delay with exponential backoff and jitter
 * @param attempt - Current attempt number (0-indexed)
 * @param initialDelay - Base delay in milliseconds
 * @returns Delay in milliseconds
 */
function calculateDelay(attempt: number, initialDelay: number): number {
  // Exponential backoff: initialDelay * 2^attempt
  const exponentialDelay = initialDelay * Math.pow(2, attempt);

  // Add jitter: random value between 0-100ms
  const jitter = Math.random() * 100;

  return exponentialDelay + jitter;
}

/**
 * Check if status code is retryable
 * @param status - HTTP status code
 * @param retryableStatusCodes - Array of retryable status codes
 * @returns True if status code should be retried
 */
function isRetryableStatus(status: number, retryableStatusCodes: readonly number[]): boolean {
  return retryableStatusCodes.includes(status);
}

/**
 * Retry an async function with exponential backoff and jitter
 * @param fn - Async function to retry
 * @param configOverride - Optional configuration override
 * @returns Promise with result and attempt count
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  configOverride: RetryConfigOverride = {}
): Promise<RetryResult<T>> {
  const config = {
    ...RETRY_CONFIG,
    ...configOverride,
    retryableStatusCodes: configOverride.retryableStatusCodes ?? RETRY_CONFIG.retryableStatusCodes,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const data = await fn();

      return { data, attempts: attempt + 1 };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error has a response with retryable status code
      const shouldRetry =
        'response' in (error as { response?: { status: number } }) &&
        (error as { response?: { status: number } }).response &&
        isRetryableStatus(
          (error as { response: { status: number } }).response.status,
          config.retryableStatusCodes
        );

      // Don't retry if this is the last attempt or error is not retryable
      if (attempt >= config.maxRetries || !shouldRetry) {
        console.error(
          `Request failed after ${attempt} attempt(s). Max retries: ${config.maxRetries}`
        );
        throw lastError;
      }

      // Calculate delay and wait before retrying
      const delay = calculateDelay(attempt, config.initialDelay);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // TypeScript safety - this should never be reached
  throw lastError || new Error('Retry failed');
}
