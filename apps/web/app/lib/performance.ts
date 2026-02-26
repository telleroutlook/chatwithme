import { onCLS, onLCP, onINP, onTTFB, Metric } from 'web-vitals';

// Performance metrics storage for analytics
interface PerformanceMetrics {
  cls: number | null;
  lcp: number | null;
  inp: number | null;
  ttfb: number | null;
}

const metrics: PerformanceMetrics = {
  cls: null,
  lcp: null,
  inp: null,
  ttfb: null,
};

// Metric rating helper (good/needs-improvement/poor)
function getRating(metric: Metric): 'good' | 'needs-improvement' | 'poor' {
  if (metric.rating === 'good') return 'good';
  if (metric.rating === 'needs-improvement') return 'needs-improvement';
  return 'poor';
}

// Log performance metric to console with context
function logMetric(metric: Metric): void {
  const rating = getRating(metric);
  const emoji = rating === 'good' ? '✅' : rating === 'needs-improvement' ? '⚠️' : '❌';

  console.log(`[Web Vitals] ${emoji} ${metric.name}:`, metric.value.toFixed(2), `(${rating})`, {
    name: metric.name,
    value: metric.value,
    rating,
    id: metric.id,
    navigationType: metric.navigationType,
  });
}

// Store metric for analytics
function storeMetric(metric: Metric): void {
  const key = metric.name.toLowerCase() as keyof PerformanceMetrics;
  metrics[key] = metric.value;
}

// Send metrics to analytics service (placeholder)
function sendToAnalytics(metric: Metric): void {
  // In production, send to your analytics service (e.g., Google Analytics, Vercel Analytics)
  // For now, we just log to console
  logMetric(metric);
  storeMetric(metric);

  // Example for Google Analytics 4:
  // if (typeof gtag !== 'undefined') {
  //   gtag('event', metric.name, {
  //     value: metric.value,
  //     metric_id: metric.id,
  //     metric_rating: metric.rating,
  //   });
  // }

  // Example for Vercel Analytics:
  // if (typeof window !== 'undefined' && (window as any).va) {
  //   (window as any).va('event', {
  //     name: metric.name,
  //     value: metric.value,
  //   });
  // }
}

// Get all collected metrics
export function getMetrics(): PerformanceMetrics {
  return { ...metrics };
}

// Get a specific metric
export function getMetric(name: keyof PerformanceMetrics): number | null {
  return metrics[name];
}

// Initialize performance monitoring
export function initPerformanceMonitoring(): void {
  // Only initialize in browser
  if (typeof window === 'undefined') {
    return;
  }

  // Core Web Vitals
  onCLS(sendToAnalytics);
  onLCP(sendToAnalytics);
  onINP(sendToAnalytics);
  onTTFB(sendToAnalytics);
}

// Reset metrics (useful for SPA navigation)
export function resetMetrics(): void {
  metrics.cls = null;
  metrics.lcp = null;
  metrics.inp = null;
  metrics.ttfb = null;
}

// Log performance summary
export function logPerformanceSummary(): void {
  console.table({
    CLS: {
      value: metrics.cls,
      rating:
        metrics.cls !== null && metrics.cls < 0.1
          ? 'good'
          : metrics.cls !== null && metrics.cls < 0.25
            ? 'needs-improvement'
            : 'poor',
    },
    LCP: {
      value: metrics.lcp,
      rating:
        metrics.lcp !== null && metrics.lcp < 2500
          ? 'good'
          : metrics.lcp !== null && metrics.lcp < 4000
            ? 'needs-improvement'
            : 'poor',
    },
    INP: {
      value: metrics.inp,
      rating:
        metrics.inp !== null && metrics.inp < 200
          ? 'good'
          : metrics.inp !== null && metrics.inp < 500
            ? 'needs-improvement'
            : 'poor',
    },
    TTFB: {
      value: metrics.ttfb,
      rating:
        metrics.ttfb !== null && metrics.ttfb < 800
          ? 'good'
          : metrics.ttfb !== null && metrics.ttfb < 1800
            ? 'needs-improvement'
            : 'poor',
    },
  });
}

// Monitor custom performance events (e.g., component render times)
export function measureCustomEvent(name: string, callback: () => void): void {
  if (typeof window === 'undefined' || !performance.mark) {
    callback();
    return;
  }

  const startMark = `${name}-start`;
  const endMark = `${name}-end`;
  const measure = `${name}-measure`;

  try {
    performance.mark(startMark);
    callback();
    performance.mark(endMark);
    performance.measure(measure, startMark, endMark);

    const entries = performance.getEntriesByName(measure);
    if (entries.length > 0) {
      const duration = entries[0].duration;
      console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
    }

    // Cleanup marks and measures
    performance.clearMarks(startMark);
    performance.clearMarks(endMark);
    performance.clearMeasures(measure);
  } catch {
    // Fallback if performance API fails
    callback();
  }
}

// Report error to analytics
export function reportError(error: Error, errorInfo?: { componentStack?: string }): void {
  const errorReport = {
    message: error.message,
    stack: error.stack,
    componentStack: errorInfo?.componentStack,
    timestamp: Date.now(),
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof window !== 'undefined' ? navigator.userAgent : '',
  };

  console.error('[Error Tracking]', errorReport);

  // Send to error tracking service (e.g., Sentry)
  // if (typeof Sentry !== 'undefined') {
  //   Sentry.captureException(error, { extra: errorInfo });
  // }
}

// Track error frequency
const errorCounts = new Map<string, number>();

export function trackErrorFrequency(errorName: string): number {
  const currentCount = errorCounts.get(errorName) || 0;
  const newCount = currentCount + 1;
  errorCounts.set(errorName, newCount);

  if (newCount > 5) {
    console.warn(`[Error Tracking] Error "${errorName}" occurred ${newCount} times`);
  }

  return newCount;
}

// Clear error counts
export function clearErrorCounts(): void {
  errorCounts.clear();
}
