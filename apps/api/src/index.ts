import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors';
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import fileRoutes from './routes/file';
import type { Env } from './store-context';

const app = new Hono<{ Bindings: Env }>();

// Apply CORS middleware
app.use('*', corsMiddleware);

// Health check
app.get('/health', (c) => {
  return c.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: c.env.ENVIRONMENT,
    },
  });
});

// Mount routes
app.route('/auth', authRoutes);
app.route('/chat', chatRoutes);
app.route('/file', fileRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ success: false, error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ success: false, error: 'Internal Server Error' }, 500);
});

// Export for Cloudflare Workers
export default app;

// Export type for Hono client
export type AppType = typeof app;
