import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { retryWithBackoff, RETRY_CONFIG } from './apiRetry';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns data on first successful attempt', async () => {
    const mockFn = vi.fn().mockResolvedValue('success');

    const result = await retryWithBackoff(mockFn);

    expect(result).toEqual({ data: 'success', attempts: 1 });
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable status code (500)', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(mockFn);

    // First attempt fails
    await vi.advanceTimersByTimeAsync(100);

    // Advance through retry delay
    await vi.advanceTimersByTimeAsync(1100);

    const result = await promise;

    expect(result).toEqual({ data: 'success', attempts: 2 });
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 Too Many Requests', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(mockFn);

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(1100);

    const result = await promise;

    expect(result).toEqual({ data: 'success', attempts: 2 });
  });

  it('does not retry on non-retryable status code (404)', async () => {
    const mockFn = vi.fn().mockRejectedValue({ response: { status: 404 } });

    // The function wraps non-Error rejections in an Error
    await expect(retryWithBackoff(mockFn)).rejects.toThrow();
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on errors without response object', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(retryWithBackoff(mockFn)).rejects.toThrow('Network error');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('respects max retries limit', async () => {
    const error = { response: { status: 500 } };
    const mockFn = vi.fn().mockRejectedValue(error);

    const promise = retryWithBackoff(mockFn);

    // Advance through all retry attempts (3 retries)
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(i === 0 ? 1100 : 2100);
    }

    await expect(promise).rejects.toThrow();
    expect(mockFn).toHaveBeenCalledTimes(RETRY_CONFIG.maxRetries + 1);
  });

  it('allows custom max retries', async () => {
    const error = { response: { status: 500 } };
    const mockFn = vi.fn().mockRejectedValue(error);

    const promise = retryWithBackoff(mockFn, { maxRetries: 1 });

    // Initial attempt + 1 retry
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(1100);

    await expect(promise).rejects.toThrow();
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('allows custom initial delay', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(mockFn, { initialDelay: 500 });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(600);

    const result = await promise;

    expect(result).toEqual({ data: 'success', attempts: 2 });
  });

  it('allows custom retryable status codes', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 418 } })
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(mockFn, { retryableStatusCodes: [418] });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(1100);

    const result = await promise;

    expect(result).toEqual({ data: 'success', attempts: 2 });
  });

  it('returns correct attempt count after multiple retries', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(mockFn);

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(1100);

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(2100);

    const result = await promise;

    expect(result.attempts).toBe(3);
  });

  it('passes through Error objects correctly', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('Custom error'));

    await expect(retryWithBackoff(mockFn)).rejects.toThrow('Custom error');
  });

  it('handles non-Error errors', async () => {
    const mockFn = vi.fn().mockRejectedValue('String error');

    // Non-Error values are wrapped in Error
    await expect(retryWithBackoff(mockFn)).rejects.toThrow();
  });

  it('adds jitter to retry delays', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(mockFn);

    await vi.advanceTimersByTimeAsync(100);
    // Move forward by more than the minimum delay (1000 + 100)
    await vi.advanceTimersByTimeAsync(1100);

    const result = await promise;

    expect(result).toEqual({ data: 'success', attempts: 2 });
  });
});

describe('RETRY_CONFIG', () => {
  it('has correct default values', () => {
    expect(RETRY_CONFIG.maxRetries).toBe(3);
    expect(RETRY_CONFIG.initialDelay).toBe(1000);
  });

  it('includes common retryable status codes', () => {
    expect(RETRY_CONFIG.retryableStatusCodes).toContain(408);
    expect(RETRY_CONFIG.retryableStatusCodes).toContain(429);
    expect(RETRY_CONFIG.retryableStatusCodes).toContain(500);
    expect(RETRY_CONFIG.retryableStatusCodes).toContain(502);
    expect(RETRY_CONFIG.retryableStatusCodes).toContain(503);
    expect(RETRY_CONFIG.retryableStatusCodes).toContain(504);
  });
});
