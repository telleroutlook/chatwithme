# Error Monitoring System

## Overview

This application includes a comprehensive error monitoring system designed for Cloudflare Workers edge environment. The system provides:

- Structured error logging with context
- Environment-aware error reporting (development vs production)
- Error sampling and rate limiting
- User-friendly error reporting UI
- Support for multiple monitoring services (Sentry, custom endpoints)

## Architecture

```
Error Monitoring System
├── lib/logger.ts           - Core logging with structured error tracking
├── lib/errorReporting.ts   - Service integration and error delivery
├── hooks/useErrorReporting.ts - React integration hook
└── components/error/ErrorReport.tsx - User-facing error reporting UI
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Monitoring service: sentry | custom | console
VITE_MONITORING_SERVICE=console

# Custom endpoint (for 'custom' service)
VITE_ERROR_MONITORING_ENDPOINT=https://your-api.com/errors

# Error sampling rate (0.0 - 1.0)
VITE_ERROR_SAMPLE_RATE=1.0

# Max errors to report per hour
VITE_ERROR_MAX_PER_HOUR=100

# App version for release tracking
VITE_APP_VERSION=1.0.0
```

### Monitoring Services

#### Console (Default)

Errors are logged to the console with structured formatting. Best for development.

```bash
VITE_MONITORING_SERVICE=console
```

#### Sentry

Integration with Sentry.io for production error tracking.

```bash
VITE_MONITORING_SERVICE=sentry
VITE_ERROR_MONITORING_ENDPOINT=https://your-sentry-dsn@sentry.io/project-id
```

#### Custom Endpoint

Send errors to your own monitoring service.

```bash
VITE_MONITORING_SERVICE=custom
VITE_ERROR_MONITORING_ENDPOINT=https://your-api.com/errors
```

Expected payload format:

```json
{
  "id": "err_1234567890_abc123",
  "name": "ErrorName",
  "message": "Error message",
  "stack": "Error stack trace",
  "timestamp": 1234567890,
  "context": {
    "userId": "user-123",
    "url": "https://example.com/page",
    "userAgent": "Mozilla/5.0...",
    "tags": { "key": "value" },
    "metadata": { "key": "value" },
    "sessionId": "session_123",
    "breadcrumbs": [...]
  }
}
```

## Usage

### Basic Error Reporting

```typescript
import { reportError } from '~/lib/logger';

try {
  // risky operation
} catch (error) {
  reportError(error, {
    tags: { operation: 'data-fetch' },
    metadata: { url: '/api/data' },
  });
}
```

### React Hook Integration

```typescript
import { useErrorReporting } from '~/hooks/useErrorReporting';

function MyComponent() {
  const { reportError, addBreadcrumb } = useErrorReporting({
    userId: 'user-123',
    componentName: 'MyComponent',
  });

  const handleClick = () => {
    addBreadcrumb('Button clicked', { buttonId: 'submit' });

    try {
      // risky operation
    } catch (error) {
      reportError(error, { tags: { action: 'click' } });
    }
  };

  return <button onClick={handleClick}>Submit</button>;
}
```

### Error Boundary Integration

```typescript
import { ErrorBoundary } from '~/components/error';
import { useErrorBoundaryReporting } from '~/hooks/useErrorReporting';

function App() {
  const { handleError } = useErrorBoundaryReporting();

  return (
    <ErrorBoundary onError={handleError}>
      <YourComponents />
    </ErrorBoundary>
  );
}
```

### User-Facing Error Reports

```typescript
import { ErrorReport } from '~/components/error';

function ErrorDisplay({ error, onClose }) {
  return (
    <ErrorReport
      error={error}
      componentStack={error.componentStack}
      onClose={onClose}
    />
  );
}
```

## Error Context

The error context system provides additional information for debugging:

```typescript
interface ErrorContext {
  // User identification (no sensitive data)
  userId?: string;
  conversationId?: string;

  // React stack trace
  componentStack?: string;

  // Browser context
  userAgent?: string;
  url?: string;

  // Custom tags for filtering/grouping
  tags?: Record<string, string | number | boolean>;

  // Additional metadata
  metadata?: Record<string, unknown>;
}
```

## Breadcrumbs

Track user actions leading up to errors:

```typescript
import { addBreadcrumb } from '~/lib/errorReporting';

// Manual breadcrumb
addBreadcrumb({
  message: 'User clicked submit',
  category: 'user-action',
  level: 'info',
  data: { formId: 'contact-form' },
});

// Via hook
const { addBreadcrumb } = useErrorReporting();
addBreadcrumb('Form submitted', { formId: 'contact' });
```

## Error Sampling

To reduce noise in production, configure error sampling:

```bash
# Sample 10% of errors
VITE_ERROR_SAMPLE_RATE=0.1

# Max 50 errors per hour per error type
VITE_ERROR_MAX_PER_HOUR=50
```

## Production Monitoring Services

### Recommended Services

#### 1. Sentry (Recommended)

- Excellent JavaScript/TypeScript support
- Works with Cloudflare Workers
- Rich context and breadcrumbs
- Performance monitoring

```bash
npm install @sentry/browser
```

Add to `app/root.tsx`:

```typescript
import * as Sentry from '@sentry/browser';

if (import.meta.env.PROD) {
  Sentry.init({
    dsn: import.meta.env.VITE_ERROR_MONITORING_ENDPOINT,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,
  });
}
```

#### 2. Custom Cloudflare Workers Endpoint

Create a Worker endpoint that receives errors and stores them (D1/R2).

```typescript
// Example error receiver Worker
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'POST' && new URL(request.url).pathname === '/errors') {
      const error = await request.json();

      // Store in D1
      await env.DB.prepare(
        'INSERT INTO errors (id, name, message, context, timestamp) VALUES (?, ?, ?, ?, ?)'
      )
        .bind(error.id, error.name, error.message, JSON.stringify(error.context), error.timestamp)
        .run();

      return Response.json({ success: true });
    }
  },
};
```

#### 3. LogPush Services

- Cloudflare LogPush to external analysis tools
- Datadog, New Relic, or other observability platforms

## Security Considerations

1. **Never log sensitive data**: Passwords, tokens, personal information
2. **Sanitize user input**: Remove sensitive data from error context
3. **Rate limiting**: Prevent error flooding attacks
4. **Secure endpoints**: Use authentication for custom endpoints

## Debugging

### View Error Statistics

```typescript
import { getErrorStats } from '~/lib/errorReporting';

const stats = getErrorStats();
console.log('Error counts:', stats);
// { "TypeError": 5, "NetworkError": 2 }
```

### Session Information

```typescript
import { getSessionInfo } from '~/lib/errorReporting';

const session = getSessionInfo();
console.log('Session:', session);
// { sessionId, startTime, breadcrumbs, userId }
```

## Best Practices

1. **Use semantic error names**: Create custom Error classes
2. **Add relevant context**: Include operation names, IDs, etc.
3. **Don't over-log**: Use sampling for high-frequency errors
4. **Act on alerts**: Set up notifications for critical errors
5. **Test error handling**: Verify error reporting works in dev

## Troubleshooting

### Errors not appearing in monitoring

1. Check environment variables are set
2. Verify network requests in browser DevTools
3. Check rate limiting isn't dropping errors
4. Review console for configuration errors

### Too many errors

1. Reduce `VITE_ERROR_SAMPLE_RATE`
2. Lower `VITE_ERROR_MAX_PER_HOUR`
3. Add error grouping/filtering logic

### Performance impact

1. Error reporting is asynchronous (non-blocking)
2. Sampling reduces overhead
3. Breadcrumbs are limited to 50 entries
4. Rate limiting prevents excessive network calls
