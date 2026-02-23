import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors';
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import fileRoutes from './routes/file';
import type { Env } from './store-context';

// Extend Env type to include ASSETS binding
interface ExtendedEnv extends Env {
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: ExtendedEnv }>();

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

// 404 handler for API routes
app.notFound((c) => {
  return c.json({ success: false, error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ success: false, error: 'Internal Server Error' }, 500);
});

// Export for Cloudflare Workers with static asset handling
export default {
  async fetch(request: Request, env: ExtendedEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Handle API routes (auth, chat, file, health)
    if (
      url.pathname.startsWith('/auth') ||
      url.pathname.startsWith('/chat') ||
      url.pathname.startsWith('/file') ||
      url.pathname === '/health'
    ) {
      return app.fetch(request, env, ctx);
    }

    // For all other requests, serve static assets
    // This handles the React SPA
    return env.ASSETS.fetch(request);
  },
};

// Export type for Hono client
export type AppType = typeof app;
