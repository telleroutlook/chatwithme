import { useAuthStore } from './stores/auth';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';

interface RequestOptions extends RequestInit {
  withAuth?: boolean;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<{ success: boolean; data?: T; error?: string }> {
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

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...fetchOptions,
      headers,
    });

    const data = await response.json();

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
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      const data = await response.json();
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

  // Special method for streaming
  async stream(
    endpoint: string,
    body: unknown,
    onMessage: (content: string) => void,
    onDone: () => void,
    onError: (error: string) => void
  ): Promise<void> {
    const tokens = useAuthStore.getState().tokens;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: tokens ? `Bearer ${tokens.accessToken}` : '',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      onError(errorData.error || 'Request failed');
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError('No response body');
      return;
    }

    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'message') {
                onMessage(event.message);
              } else if (event.type === 'done') {
                onDone();
              } else if (event.type === 'error') {
                onError(event.error);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export const api = new ApiClient(API_BASE);
