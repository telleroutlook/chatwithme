import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ERROR_CODES } from '../constants/error-codes';
import { validationErrorHook } from './response';

describe('validationErrorHook', () => {
  it('returns unified validation error shape', async () => {
    const app = new Hono();
    const schema = z.object({
      name: z.string().min(1),
    });

    app.post('/test', zValidator('json', schema, validationErrorHook), (c) => {
      const body = c.req.valid('json');
      return c.json({ success: true, data: body });
    });

    const response = await app.request('/test', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const payload = (await response.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(payload.error.message.length).toBeGreaterThan(0);
  });
});
