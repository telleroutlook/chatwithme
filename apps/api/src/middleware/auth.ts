import type { Context, Next } from 'hono';
import { verifyToken } from '../utils/jwt';
import type { AppBindings } from '../store-context';
import { ERROR_CODES } from '../constants/error-codes';
import { errorResponse } from '../utils/response';

export async function authMiddleware(c: Context<AppBindings>, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(c, 401, ERROR_CODES.UNAUTHORIZED, 'Unauthorized: No token provided');
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return errorResponse(c, 401, ERROR_CODES.UNAUTHORIZED, 'Unauthorized: Invalid or expired token');
  }

  // Store auth info in context for use in handlers
  c.set('userId', payload.userId);
  c.set('email', payload.email);

  await next();
}

// Helper to get auth info from context
export function getAuthInfo(c: Context<AppBindings>): { userId: string; email: string } {
  return {
    userId: c.get('userId'),
    email: c.get('email'),
  };
}
