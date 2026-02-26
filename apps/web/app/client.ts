import { useAuthStore } from './stores/auth';
import type { ApiResponse } from '@chatwithme/shared';
import { retryWithBackoff } from './lib/apiRetry';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface RequestOptions extends RequestInit {
  withAuth?: boolean;
}

export function getApiErrorMessage(error: ApiResponse['error']): string {
  if (!error) {
    return 'Request failed';
  }

  if (typeof error === 'string') {
    return error;
  }

  return error.message || 'Request failed';
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { withAuth = true, ...fetchOptions } = options;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (withAuth) {
      const tokens = useAuthStore.getState().tokens;
      if (tokens) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${tokens.accessToken}`;
      }
    }

    // Wrap fetch with retry mechanism
    const { data: response, attempts } = await retryWithBackoff(
      async () => {
        const res = await fetch(`${this.baseUrl}${endpoint}`, {
          ...fetchOptions,
          headers,
        });

        // Throw error for retryable status codes to trigger retry
        if (!res.ok && [408, 429, 500, 502, 503, 504].includes(res.status)) {
          const error = new Error(`HTTP ${res.status}: ${res.statusText}`) as Error & {
            response: { status: number };
          };
          error.response = { status: res.status };
          throw error;
        }

        return res;
      },
      { maxRetries: 3, initialDelay: 1000 }
    );

    // Log retry attempts if any occurred
    if (attempts > 1) {
      console.log(`API request to ${endpoint} completed after ${attempts} attempt(s)`);
    }

    const contentType = response.headers.get('content-type') || '';
    const data: ApiResponse<T> = contentType.includes('application/json')
      ? ((await response.json()) as ApiResponse<T>)
      : {
          success: response.ok,
          error: response.ok
            ? undefined
            : { code: `HTTP_${response.status}`, message: response.statusText },
        };

    // Handle 401 - try to refresh token
    if (response.status === 401 && withAuth) {
      const tokens = useAuthStore.getState().tokens;
      if (tokens?.refreshToken) {
        const refreshed = await this.refreshToken(tokens.refreshToken);
        if (refreshed) {
          // Retry the request with new token
          return this.request<T>(endpoint, options);
        } else {
          useAuthStore.getState().logout();
        }
      }
    }

    return data;
  }

  private async refreshToken(refreshToken: string): Promise<boolean> {
    try {
      // Wrap refresh token request with retry mechanism
      const { data: response, attempts } = await retryWithBackoff(
        async () => {
          const res = await fetch(`${this.baseUrl}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          // Throw error for retryable status codes to trigger retry
          if (!res.ok && [408, 429, 500, 502, 503, 504].includes(res.status)) {
            const error = new Error(`HTTP ${res.status}: ${res.statusText}`) as Error & {
              response: { status: number };
            };
            error.response = { status: res.status };
            throw error;
          }

          return res;
        },
        { maxRetries: 3, initialDelay: 1000 }
      );

      // Log retry attempts if any occurred
      if (attempts > 1) {
        console.log(`Token refresh completed after ${attempts} attempt(s)`);
      }

      const data = (await response.json()) as ApiResponse<{
        accessToken: string;
        expiresIn: number;
      }>;
      if (data.success && data.data) {
        useAuthStore.getState().updateTokens(data.data.accessToken, data.data.expiresIn);
        return true;
      }
    } catch {
      // Ignore refresh errors
    }
    return false;
  }

  async get<T>(endpoint: string, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(endpoint: string, body: unknown, options?: RequestOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async patch<T>(endpoint: string, body: unknown, options?: RequestOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(endpoint: string, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient(API_BASE);
