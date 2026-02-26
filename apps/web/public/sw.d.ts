/**
 * Service Worker Type Definitions
 */

type CacheStrategy = 'network-first' | 'stale-while-revalidate';

interface ServiceWorkerMessage {
  type: 'SKIP_WAITING' | 'CACHE_URLS';
  urls?: string[];
}

interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface ServiceWorkerGlobalScopeEventMap {
  install: ExtendableEvent;
  activate: ExtendableEvent;
  fetch: FetchEvent;
  message: MessageEvent;
}

declare const self: ServiceWorkerGlobalScope;
