/**
 * IndexedDB Utility for Offline Storage
 *
 * Provides offline storage for conversations, messages, and pending requests.
 */

import type { Conversation, Message } from '@chatwithme/shared';

// Database configuration
const DB_NAME = 'chatwithme-offline';
const DB_VERSION = 1;

// Store names
const STORES = {
  CONVERSATIONS: 'conversations',
  MESSAGES: 'messages',
  PENDING_REQUESTS: 'pending_requests',
} as const;

// Types
export interface PendingRequest {
  id: string;
  timestamp: number;
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  retryCount: number;
  maxRetries: number;
}

/**
 * Open the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create conversations store
      if (!db.objectStoreNames.contains(STORES.CONVERSATIONS)) {
        const conversationStore = db.createObjectStore(STORES.CONVERSATIONS, { keyPath: 'id' });
        conversationStore.createIndex('userId', 'userId', { unique: false });
        conversationStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Create messages store
      if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
        const messageStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' });
        messageStore.createIndex('conversationId', 'conversationId', { unique: false });
        messageStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Create pending requests store
      if (!db.objectStoreNames.contains(STORES.PENDING_REQUESTS)) {
        const requestStore = db.createObjectStore(STORES.PENDING_REQUESTS, { keyPath: 'id' });
        requestStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * Get a store transaction with defensive checks
 */
async function getStore(
  storeName: string,
  mode: IDBTransactionMode = 'readonly'
): Promise<IDBObjectStore> {
  const db = await openDB();

  // Verify store exists
  if (!db.objectStoreNames.contains(storeName)) {
    throw new Error(`Store "${storeName}" does not exist in database`);
  }

  const transaction = db.transaction(storeName, mode);
  const store = transaction.objectStore(storeName);

  // Verify store is valid
  if (!store) {
    throw new Error(`Failed to get store "${storeName}" from transaction`);
  }

  return store;
}

/**
 * Check if an index exists on a store
 */
function hasIndex(store: IDBObjectStore, indexName: string): boolean {
  return store.indexNames.contains(indexName);
}

/**
 * IndexedDB Operations
 */
export const indexedDBOps = {
  // Conversation operations
  async saveConversation(conversation: Conversation): Promise<void> {
    const store = await getStore(STORES.CONVERSATIONS, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const request = store.put(conversation);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getConversation(id: string): Promise<Conversation | null> {
    const store = await getStore(STORES.CONVERSATIONS, 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },

  async getAllConversations(): Promise<Conversation[]> {
    const store = await getStore(STORES.CONVERSATIONS, 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  async deleteConversation(id: string): Promise<void> {
    const store = await getStore(STORES.CONVERSATIONS, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  // Message operations
  async saveMessage(message: Message): Promise<void> {
    const store = await getStore(STORES.MESSAGES, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const request = store.put(message);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getMessages(conversationId: string): Promise<Message[]> {
    try {
      const store = await getStore(STORES.MESSAGES, 'readonly');

      // Check if index exists
      if (hasIndex(store, 'conversationId')) {
        const index = store.index('conversationId');
        return new Promise((resolve, reject) => {
          const request = index.getAll(conversationId);
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });
      }

      // Fallback: get all messages and filter
      console.warn('[IndexedDB] Index "conversationId" not found, using fallback method');
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const allMessages = request.result || [];
          const filtered = allMessages.filter((m: Message) => m.conversationId === conversationId);
          resolve(filtered);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[IndexedDB] getMessages error:', error);
      return [];
    }
  },

  async deleteMessages(conversationId: string): Promise<void> {
    try {
      const store = await getStore(STORES.MESSAGES, 'readwrite');

      let keys: IDBValidKey[] = [];

      // Check if index exists
      if (hasIndex(store, 'conversationId')) {
        const index = store.index('conversationId');
        keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
          const request = index.getAllKeys(conversationId);
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });
      } else {
        // Fallback: get all messages and filter keys
        console.warn('[IndexedDB] Index "conversationId" not found, using fallback method');
        const allMessages = await new Promise<Message[]>((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });
        keys = allMessages
          .filter((m: Message) => m.conversationId === conversationId)
          .map((m: Message) => m.id);
      }

      // Delete each message
      for (const key of keys) {
        await new Promise<void>((resolve, reject) => {
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }
    } catch (error) {
      console.error('[IndexedDB] deleteMessages error:', error);
      throw error;
    }
  },

  // Pending request operations
  async savePendingRequest(pendingRequest: PendingRequest): Promise<void> {
    const store = await getStore(STORES.PENDING_REQUESTS, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const request = store.put(pendingRequest);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getPendingRequests(): Promise<PendingRequest[]> {
    const store = await getStore(STORES.PENDING_REQUESTS, 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  async deletePendingRequest(id: string): Promise<void> {
    const store = await getStore(STORES.PENDING_REQUESTS, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async clearPendingRequests(): Promise<void> {
    const store = await getStore(STORES.PENDING_REQUESTS, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  // Utility operations
  async clearAll(): Promise<void> {
    const db = await openDB();
    const stores = [STORES.CONVERSATIONS, STORES.MESSAGES, STORES.PENDING_REQUESTS];

    for (const storeName of stores) {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  },
};

/**
 * Helper function to create a pending request
 */
export function createPendingRequest(
  method: PendingRequest['method'],
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
  maxRetries: number = 3
): PendingRequest {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    method,
    url,
    headers,
    body,
    retryCount: 0,
    maxRetries,
  };
}

/**
 * Helper function to retry pending requests
 */
export async function retryPendingRequests(
  retryFn: (request: PendingRequest) => Promise<boolean>
): Promise<{ succeeded: number; failed: number }> {
  const pendingRequests = await indexedDBOps.getPendingRequests();
  let succeeded = 0;
  let failed = 0;

  for (const request of pendingRequests) {
    try {
      const success = await retryFn(request);
      if (success) {
        await indexedDBOps.deletePendingRequest(request.id);
        succeeded++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error('[IndexedDB] Failed to retry request:', error);
      failed++;
    }
  }

  return { succeeded, failed };
}
