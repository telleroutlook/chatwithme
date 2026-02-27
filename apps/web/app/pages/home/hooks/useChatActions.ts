import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '~/stores/auth';
import { useChatStore } from '~/stores/chat';
import { api } from '~/client';
import { ensureConversationId } from '~/lib/chatFlow';
import { queryKeys } from '~/lib/queryKeys';
import type { Message, MessageFile, Conversation, ChatResponseData } from '@chatwithme/shared';

const ACTIVE_CONVERSATION_STORAGE_KEY = 'chatwithme-active-conversation-id';

// Feature flag for Agent mode - set to true to enable Agent path
const USE_AGENT_MODE = import.meta.env.VITE_USE_AGENT === 'true';

export interface UseChatActionsReturn {
  loadConversations: () => Promise<void>;
  restoreActiveConversation: (conversationsData: Conversation[]) => void;
  loadMessages: (conversationId: string) => Promise<void>;
  handleCreateConversation: () => Promise<void>;
  handleSelectConversation: (id: string) => void;
  handleDeleteConversation: (id: string) => Promise<void>;
  handleRenameConversation: (id: string, title: string) => Promise<void>;
  handleSendMessage: (message: string, files?: MessageFile[]) => Promise<void>;
  handleRegenerate: (currentMessages: Message[]) => Promise<void>;
  handleQuickReply: (question: string, isLoading: boolean) => Promise<void>;
  handleExportChat: (
    currentMessages: Message[],
    activeConversationId: string | null,
    conversations: Conversation[]
  ) => void;
  handleLogout: () => Promise<void>;
}

/**
 * Get headers for API requests
 * When USE_AGENT_MODE is true, includes X-Use-Agent header to enable Agent path
 */
function getApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (USE_AGENT_MODE) {
    headers['X-Use-Agent'] = 'true';
  }
  return headers;
}

export function useChatActions(): UseChatActionsReturn {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, tokens, logout } = useAuthStore();
  const {
    activeConversationId,
    setConversations,
    addConversation,
    updateConversation,
    removeConversation,
    setActiveConversation,
    setMessages,
    addMessage,
    setLoading,
    setPendingConversation,
  } = useChatStore();

  const loadConversations = useCallback(async () => {
    // Invalidate and refetch conversations using React Query
    // The data will be available via useConversations hook
    await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
  }, [queryClient]);

  // Restore active conversation from localStorage when conversations data is loaded
  const restoreActiveConversation = useCallback(
    (conversationsData: Conversation[]) => {
      if (!conversationsData || conversationsData.length === 0) return;

      // Sync to store for backward compatibility
      setConversations(conversationsData);

      // Check if current active conversation is valid
      const hasCurrentActiveConversation = conversationsData.some(
        (conversation) => conversation.id === activeConversationId
      );

      if (hasCurrentActiveConversation) {
        return; // Keep current active conversation
      }

      // Try to restore from localStorage
      const savedActiveConversationId =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY)
          : null;

      const hasSavedActiveConversation = savedActiveConversationId
        ? conversationsData.some((conversation) => conversation.id === savedActiveConversationId)
        : false;

      if (hasSavedActiveConversation) {
        setActiveConversation(savedActiveConversationId);
        return;
      }

      // Default to first conversation
      setActiveConversation(conversationsData[0]?.id ?? null);
    },
    [activeConversationId, setConversations, setActiveConversation]
  );

  const loadMessages = useCallback(
    async (conversationId: string) => {
      setLoading(true);
      // Invalidate and refetch messages using React Query
      await queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });

      // Sync React Query data to store for backward compatibility
      const messagesData = queryClient.getQueryData<Message[]>(queryKeys.messages(conversationId));
      if (messagesData) {
        setMessages(conversationId, messagesData);
      }

      setLoading(false);
    },
    [setLoading, setMessages, queryClient]
  );

  const handleCreateConversation = useCallback(async () => {
    const response = await api.post<{ conversation: Conversation }>('/chat/conversations', {});
    if (response.success && response.data) {
      addConversation(response.data.conversation);
      // Persist to localStorage for restoration on page refresh
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, response.data.conversation.id);
      }
      // Invalidate conversations query to reflect the new conversation
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    }
  }, [addConversation, queryClient]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConversation(id);
      // Persist to localStorage for restoration on page refresh
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, id);
      }
    },
    [setActiveConversation]
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const response = await api.delete(`/chat/conversations/${id}`);
      if (response.success) {
        removeConversation(id);
        // Clear localStorage if deleting the active conversation
        if (activeConversationId === id && typeof window !== 'undefined') {
          window.localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
        }
        // Invalidate conversations query to reflect the deletion
        await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
        // Invalidate messages query for this conversation
        queryClient.removeQueries({ queryKey: queryKeys.messages(id) });
      }
    },
    [removeConversation, queryClient, activeConversationId]
  );

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      const response = await api.patch(`/chat/conversations/${id}`, { title });
      if (response.success) {
        updateConversation(id, { title });
        // Invalidate conversations query to reflect the rename
        await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      }
    },
    [updateConversation, queryClient]
  );

  const ensureConversation = useCallback(
    async (): Promise<string | null> =>
      ensureConversationId({
        activeConversationId,
        createConversation: async () => {
          const response = await api.post<{ conversation: Conversation }>(
            '/chat/conversations',
            {}
          );
          if (!response.success || !response.data) {
            return null;
          }
          return response.data.conversation;
        },
        onConversationCreated: (conversation) => {
          addConversation(conversation);
          // Invalidate conversations query to reflect the new conversation
          queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
        },
      }),
    [activeConversationId, addConversation, queryClient]
  );

  const handleSendMessage = useCallback(
    async (message: string, files?: MessageFile[]) => {
      const conversationId = await ensureConversation();
      if (!conversationId) return;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        userId: user?.id || '',
        conversationId,
        role: 'user',
        message,
        files: files || [],
        generatedImageUrls: [],
        searchResults: [],
        createdAt: new Date(),
      };
      addMessage(conversationId, userMessage);

      setPendingConversation(conversationId);

      try {
        const response = await api.post<ChatResponseData>(
          '/chat/respond',
          {
            conversationId,
            message,
            files,
          },
          { headers: getApiHeaders() }
        );

        if (!response.success || !response.data) {
          throw new Error('响应失败');
        }

        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          userId: user?.id || '',
          conversationId,
          role: 'assistant',
          message: response.data.message,
          files: [],
          generatedImageUrls: [],
          searchResults: [],
          suggestions: response.data.suggestions ?? [],
          imageAnalyses: response.data.imageAnalyses,
          createdAt: new Date(),
        };
        addMessage(conversationId, assistantMessage);
      } catch (error) {
        console.error('Send message error:', error);
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          userId: user?.id || '',
          conversationId,
          role: 'assistant',
          message: '抱歉，回复失败：网络异常，请稍后重试。',
          files: [],
          generatedImageUrls: [],
          searchResults: [],
          createdAt: new Date(),
        };
        addMessage(conversationId, errorMessage);
      } finally {
        setPendingConversation(null);
        // Invalidate messages query to keep React Query in sync
        queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
      }
    },
    [ensureConversation, user, addMessage, setPendingConversation, queryClient]
  );

  const handleRegenerate = useCallback(
    async (currentMessages: Message[]) => {
      if (!activeConversationId || currentMessages.length === 0) return;

      const lastMessage = currentMessages[currentMessages.length - 1];

      // Find the last user message
      const lastUserMessageIndex = [...currentMessages]
        .reverse()
        .findIndex((m) => m.role === 'user');
      if (lastUserMessageIndex === -1) return;

      const lastUserMessage = currentMessages[currentMessages.length - 1 - lastUserMessageIndex];

      // If last message is assistant, remove it before regenerating
      if (lastMessage.role === 'assistant') {
        setMessages(activeConversationId, currentMessages.slice(0, -1));
      }

      setPendingConversation(activeConversationId);

      try {
        const response = await api.post<ChatResponseData>(
          '/chat/respond',
          {
            conversationId: activeConversationId,
            message: lastUserMessage.message,
            files: lastUserMessage.files || undefined,
          },
          { headers: getApiHeaders() }
        );

        if (!response.success || !response.data) {
          throw new Error('响应失败');
        }

        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          userId: user?.id || '',
          conversationId: activeConversationId,
          role: 'assistant',
          message: response.data.message,
          files: [],
          generatedImageUrls: [],
          searchResults: [],
          suggestions: response.data.suggestions ?? [],
          imageAnalyses: response.data.imageAnalyses,
          createdAt: new Date(),
        };
        addMessage(activeConversationId, assistantMessage);
      } catch (error) {
        console.error('Regenerate error:', error);
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          userId: user?.id || '',
          conversationId: activeConversationId,
          role: 'assistant',
          message: '抱歉，重新生成失败：网络异常，请稍后重试。',
          files: [],
          generatedImageUrls: [],
          searchResults: [],
          createdAt: new Date(),
        };
        addMessage(activeConversationId, errorMessage);
      } finally {
        setPendingConversation(null);
        // Invalidate messages query to keep React Query in sync
        queryClient.invalidateQueries({ queryKey: queryKeys.messages(activeConversationId) });
      }
    },
    [activeConversationId, user, setMessages, addMessage, setPendingConversation, queryClient]
  );

  const handleQuickReply = useCallback(
    async (question: string, isLoading: boolean) => {
      if (!question.trim() || isLoading) return;
      await handleSendMessage(question);
    },
    [handleSendMessage]
  );

  const handleExportChat = useCallback(
    (
      currentMessages: Message[],
      activeConversationId: string | null,
      conversations: Conversation[]
    ) => {
      if (!activeConversationId || currentMessages.length === 0) return;
      // Import dynamically to avoid circular dependency
      import('~/lib/chatExport').then(({ exportChatToHtml }) => {
        const title = conversations.find((c) => c.id === activeConversationId)?.title || 'Chat';
        exportChatToHtml(currentMessages, title);
      });
    },
    []
  );

  const handleLogout = useCallback(async () => {
    if (tokens?.refreshToken) {
      await api.post('/auth/signout', { refreshToken: tokens.refreshToken }, { withAuth: false });
    }
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    }
    logout();
    navigate('/signin');
  }, [tokens, logout, navigate]);

  return {
    loadConversations,
    restoreActiveConversation,
    loadMessages,
    handleCreateConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
    handleSendMessage,
    handleRegenerate,
    handleQuickReply,
    handleExportChat,
    handleLogout,
  };
}
