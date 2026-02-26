/**
 * Service Worker Registration Utility
 *
 * Registers the service worker for offline support and PWA capabilities.
 */

const SW_URL = '/sw.ts';

export interface ServiceWorkerRegisterOptions {
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
}

/**
 * Check if service workers are supported
 */
export function isServiceWorkerSupported(): boolean {
  return 'serviceWorker' in navigator;
}

/**
 * Register the service worker
 */
export function registerSW(
  options: ServiceWorkerRegisterOptions = {}
): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    console.warn('[SW] Service workers are not supported in this browser');
    return Promise.resolve(null);
  }

  return navigator.serviceWorker
    .register(SW_URL)
    .then((registration) => {
      console.log('[SW] Service worker registered successfully');

      // Check for updates
      if (registration.waiting) {
        options.onUpdate?.(registration);
      } else if (registration.installing) {
        registration.installing.addEventListener('statechange', () => {
          if (registration.waiting) {
            options.onUpdate?.(registration);
          } else if (registration.active) {
            options.onSuccess?.(registration);
          }
        });
      } else {
        options.onSuccess?.(registration);
      }

      // Listen for controlling changes
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              options.onUpdate?.(registration);
            }
          });
        }
      });

      return registration;
    })
    .catch((error) => {
      console.error('[SW] Service worker registration failed:', error);
      return null;
    });
}

/**
 * Unregister the service worker
 */
export async function unregisterSW(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.unregister();
      console.log('[SW] Service worker unregistered successfully');
      return true;
    }
    return false;
  } catch (error) {
    console.error('[SW] Service worker unregistration failed:', error);
    return false;
  }
}

/**
 * Skip waiting and activate the new service worker immediately
 */
export function skipWaiting(): void {
  if (!isServiceWorkerSupported()) {
    return;
  }

  navigator.serviceWorker.ready.then((registration) => {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  });
}

/**
 * Check if there's a waiting service worker (update available)
 */
export async function hasWaitingSW(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.waiting !== undefined;
  } catch {
    return false;
  }
}

/**
 * Get the current service worker registration
 */
export async function getSWRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration ?? null;
  } catch {
    return null;
  }
}
