import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '~/stores/auth';
import { useChatStore } from '~/stores/chat';
import { api } from '~/client';
import { ensureConversationId } from '~/lib/chatFlow';
import type { Message, MessageFile, Conversation } from '@chatwithme/shared';

const ACTIVE_CONVERSATION_STORAGE_KEY = 'chatwithme-active-conversation-id';

export interface UseChatActionsReturn {
  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  handleCreateConversation: () => Promise<void>;
  handleSelectConversation: (id: string) => void;
  handleDeleteConversation: (id: string) => Promise<void>;
  handleRenameConversation: (id: string, title: string) => Promise<void>;
  handleSendMessage: (message: string, files?: MessageFile[]) => Promise<void>;
  handleRegenerate: (currentMessages: Message[]) => Promise<void>;
  handleQuickReply: (question: string, isLoading: boolean) => Promise<void>;
  handleExportChat: (currentMessages: Message[], activeConversationId: string | null, conversations: Conversation[]) => void;
  handleLogout: () => Promise<void>;
}

export function useChatActions(): UseChatActionsReturn {
  const navigate = useNavigate();
  const { user, tokens, logout } = useAuthStore();
  const {
    conversations,
    activeConversationId,
    messages,
    setConversations,
    addConversation,
    updateConversation,
    removeConversation,
    setActiveConversation,
    setMessages,
    addMessage,
    setLoading,
  } = useChatStore();

  const loadConversations = useCallback(async () => {
    const response = await api.get<{ conversations: Conversation[] }>('/chat/conversations');
    if (response.success && response.data) {
      const loadedConversations = response.data.conversations;
      setConversations(loadedConversations);
      const savedActiveConversationId = window.localStorage.getItem(
        ACTIVE_CONVERSATION_STORAGE_KEY
      );

      const hasCurrentActiveConversation = loadedConversations.some(
        (conversation) => conversation.id === activeConversationId
      );
      const hasSavedActiveConversation = savedActiveConversationId
        ? loadedConversations.some((conversation) => conversation.id === savedActiveConversationId)
        : false;

      if (hasCurrentActiveConversation) {
        return;
      }

      if (hasSavedActiveConversation) {
        setActiveConversation(savedActiveConversationId);
        return;
      }

      setActiveConversation(loadedConversations[0]?.id ?? null);
    }
  }, [conversations, activeConversationId, setConversations, setActiveConversation]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoading(true);
    const response = await api.get<{ messages: Message[] }>(
      `/chat/conversations/${conversationId}/messages`
    );
    if (response.success && response.data) {
      setMessages(conversationId, response.data.messages);
    }
    setLoading(false);
  }, [setLoading, setMessages]);

  const handleCreateConversation = useCallback(async () => {
    const response = await api.post<{ conversation: Conversation }>(
      '/chat/conversations',
      {}
    );
    if (response.success && response.data) {
      addConversation(response.data.conversation);
    }
  }, [addConversation]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversation(id);
  }, [setActiveConversation]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    const response = await api.delete(`/chat/conversations/${id}`);
    if (response.success) {
      removeConversation(id);
    }
  }, [removeConversation]);

  const handleRenameConversation = useCallback(async (id: string, title: string) => {
    const response = await api.patch(`/chat/conversations/${id}`, { title });
    if (response.success) {
      updateConversation(id, { title });
    }
  }, [updateConversation]);

  const ensureConversation = useCallback(async (): Promise<string | null> =>
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
      onConversationCreated: addConversation,
    }), [activeConversationId, addConversation]);

  const handleSendMessage = useCallback(async (message: string, files?: MessageFile[]) => {
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

    try {
      const response = await api.post<{ message: string; suggestions: string[] }>(
        '/chat/respond',
        {
          conversationId,
          message,
          files,
        }
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
    }
  }, [ensureConversation, user, addMessage]);

  const handleRegenerate = useCallback(async (currentMessages: Message[]) => {
    if (!activeConversationId || currentMessages.length < 2) return;

    // Find the last user message
    const lastUserMessageIndex = [...currentMessages]
      .reverse()
      .findIndex((m) => m.role === 'user');
    if (lastUserMessageIndex === -1) return;

    const lastUserMessage =
      currentMessages[currentMessages.length - 1 - lastUserMessageIndex];

    // Remove the last assistant message
    const lastAssistantMessage = currentMessages[currentMessages.length - 1];
    if (lastAssistantMessage.role !== 'assistant') return;

    // Remove last assistant message from store
    setMessages(
      activeConversationId,
      currentMessages.slice(0, -1)
    );

    try {
      const response = await api.post<{ message: string; suggestions: string[] }>(
        '/chat/respond',
        {
          conversationId: activeConversationId,
          message: lastUserMessage.message,
          files: lastUserMessage.files || undefined,
        }
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
    }
  }, [activeConversationId, user, setMessages, addMessage]);

  const handleQuickReply = useCallback(async (question: string, isLoading: boolean) => {
    if (!question.trim() || isLoading) return;
    await handleSendMessage(question);
  }, [handleSendMessage]);

  const handleExportChat = useCallback((
    currentMessages: Message[],
    activeConversationId: string | null,
    conversations: Conversation[]
  ) => {
    if (!activeConversationId || currentMessages.length === 0) return;
    // Import dynamically to avoid circular dependency
    import('~/lib/chatExport').then(({ exportChatToHtml }) => {
      const title =
        conversations.find((c) => c.id === activeConversationId)?.title || 'Chat';
      exportChatToHtml(currentMessages, title);
    });
  }, []);

  const handleLogout = useCallback(async () => {
    if (tokens?.refreshToken) {
      await api.post('/auth/signout', { refreshToken: tokens.refreshToken }, { withAuth: false });
    }
    window.localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    logout();
    navigate('/signin');
  }, [tokens, logout, navigate]);

  return {
    loadConversations,
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
