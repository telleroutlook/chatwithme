/**
 * Offline Sync Utility
 *
 * Provides utilities for syncing data when coming back online.
 */

import { indexedDBOps, type PendingRequest } from './indexedDB';

interface SyncResult {
  succeeded: number;
  failed: number;
}

/**
 * Retry a single pending request
 */
async function retryRequest(request: PendingRequest): Promise<boolean> {
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        ...request.headers,
      },
      body: request.body ? JSON.stringify(request.body) : undefined,
    });

    if (response.ok) {
      await indexedDBOps.deletePendingRequest(request.id);
      return true;
    }

    return false;
  } catch (error) {
    console.error('[offlineSync] Failed to retry request:', error);
    return false;
  }
}

/**
 * Sync all pending requests
 */
export async function syncPendingRequests(): Promise<SyncResult> {
  const pendingRequests = await indexedDBOps.getPendingRequests();

  if (pendingRequests.length === 0) {
    return { succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  // Process requests in order (oldest first)
  const sortedRequests = pendingRequests.sort((a, b) => a.timestamp - b.timestamp);

  for (const request of sortedRequests) {
    try {
      const success = await retryRequest(request);
      if (success) {
        succeeded++;
      } else {
        // Increment retry count
        request.retryCount++;
        if (request.retryCount >= request.maxRetries) {
          // Max retries reached, delete the request
          await indexedDBOps.deletePendingRequest(request.id);
          console.error('[offlineSync] Max retries reached for request:', request.url);
        } else {
          // Update retry count
          await indexedDBOps.savePendingRequest(request);
        }
        failed++;
      }
    } catch (error) {
      console.error('[offlineSync] Error retrying request:', error);
      failed++;
    }
  }

  return { succeeded, failed };
}

/**
 * Check if there are pending requests
 */
export async function hasPendingRequests(): Promise<boolean> {
  const pendingRequests = await indexedDBOps.getPendingRequests();
  return pendingRequests.length > 0;
}

/**
 * Get count of pending requests
 */
export async function getPendingRequestsCount(): Promise<number> {
  const pendingRequests = await indexedDBOps.getPendingRequests();
  return pendingRequests.length;
}

/**
 * Clear all pending requests
 */
export async function clearPendingRequests(): Promise<void> {
  await indexedDBOps.clearPendingRequests();
}

/**
 * Queue a request for later sync
 */
export async function queueRequest(
  method: PendingRequest['method'],
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
  maxRetries: number = 3
): Promise<void> {
  const request: PendingRequest = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    method,
    url,
    headers,
    body,
    retryCount: 0,
    maxRetries,
  };

  await indexedDBOps.savePendingRequest(request);
}
