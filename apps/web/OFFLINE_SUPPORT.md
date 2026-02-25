# Offline Support Implementation

This document describes the offline support implementation for the chatwithme application using Service Worker and IndexedDB.

## Overview

The offline support enables users to:
- Continue viewing cached conversations and messages while offline
- Queue API requests when offline and sync them when back online
- See offline status indicator
- Have a fallback page when offline

## Architecture

### 1. Service Worker (`/public/sw.js`)

The service worker implements caching strategies for different types of resources:

**Cache-First Strategy** (for static assets):
- CSS, JavaScript, images
- Serves from cache first, falls back to network
- Updates cache in background

**Network-First Strategy** (for API calls):
- All `/api/*` endpoints
- Tries network first, falls back to cache
- Ensures fresh data when online

**Key Features:**
- Automatic cache versioning (via `CACHE_NAME`)
- Cleanup of old caches on activation
- Offline fallback HTML page

### 2. IndexedDB (`/app/lib/indexedDB.ts`)

IndexedDB stores three types of data:

**Conversations Store:**
- Indexed by `id`
- Secondary indexes: `userId`, `updatedAt`

**Messages Store:**
- Indexed by `id`
- Secondary indexes: `conversationId`, `createdAt`

**Pending Requests Store:**
- Queued API requests for retry when online
- Indexed by `id`
- Secondary index: `timestamp`
- Includes retry count and max retries

### 3. Service Worker Registration (`/app/lib/serviceWorker.ts`)

Utilities for service worker management:
- `registerSW()` - Register with update callbacks
- `unregisterSW()` - Unregister the service worker
- `skipWaiting()` - Force activate new version
- `hasWaitingSW()` - Check for updates
- `getSWRegistration()` - Get current registration

### 4. Offline Detection (`/app/hooks/useOnlineStatus.ts`)

React hook that listens to browser online/offline events:
- Returns current online status (`boolean`)
- Updates on network state changes

### 5. Offline Sync (`/app/lib/offlineSync.ts`)

Utilities for syncing offline data:
- `syncPendingRequests()` - Retry queued requests
- `hasPendingRequests()` - Check if there are queued requests
- `getPendingRequestsCount()` - Get count of queued requests
- `clearPendingRequests()` - Clear all queued requests
- `queueRequest()` - Add a request to the queue

### 6. Offline Indicator (`/app/components/OfflineIndicator.tsx`)

Visual banner shown when offline:
- Displays "You're offline. Changes will sync when you reconnect."
- Auto-hides when coming back online
- Smooth slide animation

### 7. Chat Store Integration (`/app/stores/chat.ts`)

Added offline support to the chat store:
- `isOnline` - Current online status
- `pendingRequestsCount` - Number of queued requests
- `setOnlineStatus()` - Update online status
- `syncOfflineData()` - Load offline data from IndexedDB
- `queuePendingRequest()` - Queue an API request
- `clearPendingRequests()` - Clear all pending requests

## Usage

### Registering the Service Worker

The service worker is automatically registered in `root.tsx`:

```typescript
registerSW({
  onUpdate: (registration) => {
    // New version available
  },
  onSuccess: (registration) => {
    // Service worker activated
  },
});
```

### Using Offline Status

```typescript
import { useOnlineStatus } from '~/hooks/useOnlineStatus';

function MyComponent() {
  const isOnline = useOnlineStatus();
  return <div>{isOnline ? 'Online' : 'Offline'}</div>;
}
```

### Queueing Requests When Offline

```typescript
import { useChatStore } from '~/stores/chat';

function sendMessage(message: string) {
  const { isOnline, queuePendingRequest } = useChatStore.getState();

  if (isOnline) {
    // Send normally
    await fetch('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  } else {
    // Queue for later
    await queuePendingRequest('POST', '/api/messages', { message });
  }
}
```

### Syncing Offline Data

```typescript
import { syncPendingRequests } from '~/lib/offlineSync';

// When coming back online
window.addEventListener('online', async () => {
  const result = await syncPendingRequests();
  console.log(`Synced ${result.succeeded} requests`);
});
```

## Testing

### Manual Testing

1. **Offline Mode:**
   - Open DevTools -> Network tab
   - Select "Offline" throttling
   - Refresh the page
   - Verify cached assets load
   - Verify offline banner appears

2. **Request Queueing:**
   - Go offline
   - Send a message (should queue)
   - Go online
   - Verify message syncs to server

3. **Service Worker:**
   - Open DevTools -> Application -> Service Workers
   - Verify service worker is active
   - Check cached resources in Cache Storage

### Automated Testing

```bash
# Run tests (when implemented)
npm run test:run
```

## Browser Support

Offline support requires:
- Service Worker API
- IndexedDB
- Fetch API

Supported browsers:
- Chrome/Edge 40+
- Firefox 34+
- Safari 11.1+
- Opera 27+

## Limitations

1. **Storage Limits:** IndexedDB has storage limits (typically 50-80% of disk space)
2. **Request Types:** Only GET/POST/PUT/DELETE/PATCH requests can be queued
3. **File Uploads:** Large file uploads when offline may exceed storage limits
4. **Authentication:** Queued requests with expired tokens will fail

## Security Considerations

1. **IndexedDB:** Same-origin policy applies
2. **Service Worker:** Only controls pages under its scope
3. **Sensitive Data:** Avoid storing sensitive tokens in IndexedDB
4. **HTTPS Required:** Service workers only work over HTTPS (except localhost)

## Future Enhancements

- [ ] Background sync API for automatic retry
- [ ] Conflict resolution for concurrent edits
- [ ] Selective sync (user can choose what to sync)
- [ ] Sync progress indicator
- [ ] Offline data export
- [ ] Data compression for storage efficiency
