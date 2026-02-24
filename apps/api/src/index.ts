import { Hono } from 'hono';
import { corsMiddleware } from './middleware';
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import fileRoutes from './routes/file';
import type { AppBindings, Env } from './store-context';
import { ERROR_CODES } from './constants/error-codes';
import { errorResponse } from './utils/response';

// Extend Env type to include ASSETS binding
interface ExtendedEnv extends Env {
  ASSETS: Fetcher;
}

type WorkerBindings = Omit<AppBindings, 'Bindings'> & {
  Bindings: ExtendedEnv;
};

const app = new Hono<WorkerBindings>();

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
  return errorResponse(c, 404, ERROR_CODES.NOT_FOUND, 'Not Found');
});

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);

  // Check for JSON parsing errors
  // Hono throws errors with message containing "JSON" when parsing fails
  if (err instanceof Error && err.message.includes('JSON')) {
    return errorResponse(c, 400, ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON format');
  }

  return errorResponse(c, 500, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Internal Server Error');
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
