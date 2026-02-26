import type { Context } from 'hono';
import { ERROR_CODES, type ErrorCode } from '../constants/error-codes';

export interface ApiErrorPayload {
  code: ErrorCode;
  message: string;
}

export function errorResponse(c: Context, status: number, code: ErrorCode, message: string) {
  return c.json(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    status as 400 | 401 | 403 | 404 | 409 | 422 | 500
  );
}

export function validationErrorHook(
  result: {
    success: boolean;
    error?: { issues?: Array<{ message: string; path?: Array<string | number> }> };
  },
  c: Context
) {
  if (result.success) {
    return;
  }

  const firstIssue = result.error?.issues?.[0];
  const path = firstIssue?.path?.length ? `${firstIssue.path.join('.')}: ` : '';
  return errorResponse(
    c,
    400,
    ERROR_CODES.VALIDATION_ERROR,
    `${path}${firstIssue?.message ?? 'Invalid request'}`
  );
}
