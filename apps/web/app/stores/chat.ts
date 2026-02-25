import { create } from 'zustand';
import type { Conversation, Message } from '@chatwithme/shared';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;
  isLoading: boolean;
  pendingConversationId: string | null;

  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, data: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;

  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;

  setLoading: (loading: boolean) => void;
  setPendingConversation: (conversationId: string | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  isLoading: false,
  pendingConversationId: null,

  setConversations: (conversations) => set({ conversations }),

  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: conversation.id,
      messages: { ...state.messages, [conversation.id]: [] },
    })),

  updateConversation: (id, data) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, ...data } : c
      ),
    })),

  removeConversation: (id) =>
    set((state) => {
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
    set((state) => ({
      messages: { ...state.messages, [conversationId]: messages },
    })),

  addMessage: (conversationId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [...(state.messages[conversationId] || []), message],
      },
    })),

  setLoading: (loading) => set({ isLoading: loading }),
  setPendingConversation: (conversationId) => set({ pendingConversationId: conversationId }),
}));
