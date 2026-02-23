import type { Context, Next } from 'hono';
import { verifyToken } from '../utils/jwt';
import type { Env } from '../store-context';

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized: No token provided' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json({ success: false, error: 'Unauthorized: Invalid or expired token' }, 401);
  }

  // Store auth info in context for use in handlers
  c.set('userId', payload.userId);
  c.set('email', payload.email);

  await next();
}

// Helper to get auth info from context
export function getAuthInfo(c: Context): { userId: string; email: string } {
  return {
    userId: c.get('userId'),
    email: c.get('email'),
  };
}
