/**
 * Hook for offline data synchronization
 *
 * Automatically syncs offline data when the device comes back online.
 */

import { useEffect, useRef } from 'react';
import { useChatStore } from '../stores/chat';
import { indexedDBOps, type PendingRequest } from '../lib/indexedDB';

interface UseOfflineSyncOptions {
  enabled?: boolean;
  onSyncStart?: () => void;
  onSyncComplete?: (result: { succeeded: number; failed: number }) => void;
  onSyncError?: (error: Error) => void;
}

export function useOfflineSync(options: UseOfflineSyncOptions = {}) {
  const { enabled = true, onSyncStart, onSyncComplete, onSyncError } = options;

  const { isOnline, syncOfflineData } = useChatStore();
  const syncInProgressRef = useRef(false);

  useEffect(() => {
    if (!enabled || !isOnline || syncInProgressRef.current) {
      return;
    }

    const syncData = async () => {
      syncInProgressRef.current = true;
      onSyncStart?.();

      try {
        // First, sync offline conversations and messages
        await syncOfflineData();

        // Then, retry pending requests
        const pendingRequests = await indexedDBOps.getPendingRequests();
        let succeeded = 0;
        let failed = 0;

        for (const request of pendingRequests) {
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
              succeeded++;
            } else {
              failed++;
            }
          } catch (error) {
            console.error('[useOfflineSync] Failed to retry request:', error);
            failed++;
          }
        }

        // Update pending requests count in store
        const remainingRequests = await indexedDBOps.getPendingRequests();
        useChatStore.setState({ pendingRequestsCount: remainingRequests.length });

        onSyncComplete?.({ succeeded, failed });
      } catch (error) {
        console.error('[useOfflineSync] Sync failed:', error);
        onSyncError?.(error as Error);
      } finally {
        syncInProgressRef.current = false;
      }
    };

    // Add a small delay to ensure network is stable
    const timeoutId = setTimeout(syncData, 1000);
    return () => clearTimeout(timeoutId);
  }, [enabled, isOnline, syncOfflineData, onSyncStart, onSyncComplete, onSyncError]);
}

/**
 * Hook to queue API requests when offline
 */
export function useOfflineRequest() {
  const { isOnline, queuePendingRequest } = useChatStore();

  const fetchWithOfflineSupport = async (
    url: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    if (isOnline) {
      return fetch(url, options);
    }

    // Queue the request for later
    const method = (options.method || 'POST') as PendingRequest['method'];
    let body: unknown;

    if (options.body) {
      try {
        body = JSON.parse(options.body as string);
      } catch {
        body = options.body;
      }
    }

    await queuePendingRequest(method, url, body);

    // Return a mock response
    return new Response(
      JSON.stringify({
        success: false,
        offline: true,
        message: 'Request queued for sync when online',
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  };

  return { fetchWithOfflineSupport, isOnline };
}
