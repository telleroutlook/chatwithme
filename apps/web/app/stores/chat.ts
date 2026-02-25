import { create } from 'zustand';
import type { Conversation, Message } from '@chatwithme/shared';
import { indexedDBOps, createPendingRequest } from '../lib/indexedDB';

// Selector hooks for optimized subscriptions
export const selectCurrentMessages = (state: ChatState, conversationId: string | null) =>
  conversationId ? state.messages[conversationId] || [] : [];

export const selectActiveConversation = (state: ChatState) =>
  state.conversations.find(c => c.id === state.activeConversationId);

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;
  isLoading: boolean;
  pendingConversationId: string | null;
  isOnline: boolean;
  pendingRequestsCount: number;

  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, data: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;

  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;

  setLoading: (loading: boolean) => void;
  setPendingConversation: (conversationId: string | null) => void;

  // Offline support
  setOnlineStatus: (isOnline: boolean) => void;
  syncOfflineData: () => Promise<void>;
  queuePendingRequest: (method: 'POST' | 'PUT' | 'DELETE' | 'PATCH', url: string, body?: unknown) => Promise<void>;
  clearPendingRequests: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  isLoading: false,
  pendingConversationId: null,
  isOnline: true,
  pendingRequestsCount: 0,

  setConversations: (conversations) => {
    set({ conversations });
    // Save to IndexedDB for offline access
    conversations.forEach((conv) => {
      indexedDBOps.saveConversation(conv).catch(console.error);
    });
  },

  addConversation: (conversation) =>
    set((state) => {
      // Save to IndexedDB
      indexedDBOps.saveConversation(conversation).catch(console.error);
      return {
        conversations: [conversation, ...state.conversations],
        activeConversationId: conversation.id,
        messages: { ...state.messages, [conversation.id]: [] },
      };
    }),

  updateConversation: (id, data) =>
    set((state) => {
      const updated = state.conversations.map((c) =>
        c.id === id ? { ...c, ...data } : c
      );
      // Update in IndexedDB
      const conversation = updated.find(c => c.id === id);
      if (conversation) {
        indexedDBOps.saveConversation(conversation).catch(console.error);
      }
      return { conversations: updated };
    }),

  removeConversation: (id) =>
    set((state) => {
      // Remove from IndexedDB
      indexedDBOps.deleteConversation(id).catch(console.error);
      indexedDBOps.deleteMessages(id).catch(console.error);

      const { [id]: _, ...remainingMessages } = state.messages;
      const remainingConversations = state.conversations.filter((c) => c.id !== id);
      return {
        conversations: remainingConversations,
        messages: remainingMessages,
        activeConversationId:
          state.activeConversationId === id
            ? remainingConversations[0]?.id || null
            : state.activeConversationId,
      };
    }),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  setMessages: (conversationId, messages) =>
    set((state) => {
      // Save to IndexedDB
      messages.forEach((msg) => {
        indexedDBOps.saveMessage(msg).catch(console.error);
      });
      return {
        messages: { ...state.messages, [conversationId]: messages },
      };
    }),

  addMessage: (conversationId, message) =>
    set((state) => {
      // Save to IndexedDB
      indexedDBOps.saveMessage(message).catch(console.error);
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...(state.messages[conversationId] || []), message],
        },
      };
    }),

  setLoading: (loading) => set({ isLoading: loading }),
  setPendingConversation: (conversationId) => set({ pendingConversationId: conversationId }),

  // Offline support methods
  setOnlineStatus: (isOnline) => set({ isOnline }),

  syncOfflineData: async () => {
    try {
      // Load conversations from IndexedDB
      const offlineConversations = await indexedDBOps.getAllConversations();
      if (offlineConversations.length > 0) {
        set({ conversations: offlineConversations });
      }

      // Load messages for each conversation
      for (const conv of offlineConversations) {
        const messages = await indexedDBOps.getMessages(conv.id);
        if (messages.length > 0) {
          set((state) => ({
            messages: { ...state.messages, [conv.id]: messages },
          }));
        }
      }

      // Update pending requests count
      const pendingRequests = await indexedDBOps.getPendingRequests();
      set({ pendingRequestsCount: pendingRequests.length });
    } catch (error) {
      console.error('[ChatStore] Failed to sync offline data:', error);
    }
  },

  queuePendingRequest: async (method, url, body) => {
    try {
      const request = createPendingRequest(method, url, body);
      await indexedDBOps.savePendingRequest(request);
      set((state) => ({
        pendingRequestsCount: state.pendingRequestsCount + 1,
      }));
    } catch (error) {
      console.error('[ChatStore] Failed to queue pending request:', error);
    }
  },

  clearPendingRequests: async () => {
    try {
      await indexedDBOps.clearPendingRequests();
      set({ pendingRequestsCount: 0 });
    } catch (error) {
      console.error('[ChatStore] Failed to clear pending requests:', error);
    }
  },
}));
