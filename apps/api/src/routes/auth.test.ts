import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import authRoutes from './auth';
import { ERROR_CODES } from '../constants/error-codes';

describe('auth route error responses', () => {
  it('returns validation error code for invalid signin payload', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    const response = await app.request('/auth/signin', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'not-an-email' }),
    });

    const payload = (await response.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('returns unauthorized code for missing token on /me', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    const response = await app.request('/auth/me');
    const payload = (await response.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };

    expect(response.status).toBe(401);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe(ERROR_CODES.UNAUTHORIZED);
  });
});
