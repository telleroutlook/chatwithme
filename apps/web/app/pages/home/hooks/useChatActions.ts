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
  const queryClient = useQueryClient();
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
    setPendingConversation,
  } = useChatStore();

  const loadConversations = useCallback(async () => {
    // Invalidate and refetch conversations using React Query
    await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });

    // React Query will fetch the data, and the component will receive it via the hook
    // We still keep the sync logic for localStorage
    const savedActiveConversationId = typeof window !== 'undefined' 
      ? window.localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY)
      : null;
    // Get fresh data from React Query cache after invalidation
    const conversationsData = queryClient.getQueryData<Conversation[]>(queryKeys.conversations);

    if (conversationsData) {
      // Sync to store for backward compatibility
      setConversations(conversationsData);

      const hasCurrentActiveConversation = conversationsData.some(
        (conversation) => conversation.id === activeConversationId
      );
      const hasSavedActiveConversation = savedActiveConversationId
        ? conversationsData.some((conversation) => conversation.id === savedActiveConversationId)
        : false;

      if (hasCurrentActiveConversation) {
        return;
      }

      if (hasSavedActiveConversation) {
        setActiveConversation(savedActiveConversationId);
        return;
      }

      setActiveConversation(conversationsData[0]?.id ?? null);
    }
  }, [activeConversationId, setConversations, setActiveConversation, queryClient]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoading(true);
    // Invalidate and refetch messages using React Query
    await queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });

    // Sync React Query data to store for backward compatibility
    const messagesData = queryClient.getQueryData<Message[]>(queryKeys.messages(conversationId));
    if (messagesData) {
      setMessages(conversationId, messagesData);
    }

    setLoading(false);
  }, [setLoading, setMessages, queryClient]);

  const handleCreateConversation = useCallback(async () => {
    const response = await api.post<{ conversation: Conversation }>(
      '/chat/conversations',
      {}
    );
    if (response.success && response.data) {
      addConversation(response.data.conversation);
      // Invalidate conversations query to reflect the new conversation
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    }
  }, [addConversation, queryClient]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversation(id);
  }, [setActiveConversation]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    const response = await api.delete(`/chat/conversations/${id}`);
    if (response.success) {
      removeConversation(id);
      // Invalidate conversations query to reflect the deletion
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      // Invalidate messages query for this conversation
      queryClient.removeQueries({ queryKey: queryKeys.messages(id) });
    }
  }, [removeConversation, queryClient]);

  const handleRenameConversation = useCallback(async (id: string, title: string) => {
    const response = await api.patch(`/chat/conversations/${id}`, { title });
    if (response.success) {
      updateConversation(id, { title });
      // Invalidate conversations query to reflect the rename
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    }
  }, [updateConversation, queryClient]);

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
      onConversationCreated: (conversation) => {
        addConversation(conversation);
        // Invalidate conversations query to reflect the new conversation
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      },
    }), [activeConversationId, addConversation, queryClient]);

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

    setPendingConversation(conversationId);

    // Debug log: Check extractedText before sending
    if (files && files.length > 0) {
      console.log('[Frontend] Sending files:', files.length);
      for (const file of files) {
        console.log('[Frontend] File:', file.fileName, 'Type:', file.mimeType);
        if (file.extractedText) {
          console.log('[Frontend] Has extractedText, length:', file.extractedText.length);
          console.log('[Frontend] Extracted text preview (first 200 chars):', file.extractedText.substring(0, 200));
        } else {
          console.log('[Frontend] No extractedText for file:', file.fileName);
        }
      }
    }

    try {
      const response = await api.post<ChatResponseData>(
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
  }, [ensureConversation, user, addMessage, setPendingConversation, queryClient]);

  const handleRegenerate = useCallback(async (currentMessages: Message[]) => {
    if (!activeConversationId || currentMessages.length === 0) return;

    const lastMessage = currentMessages[currentMessages.length - 1];

    // Find the last user message
    const lastUserMessageIndex = [...currentMessages]
      .reverse()
      .findIndex((m) => m.role === 'user');
    if (lastUserMessageIndex === -1) return;

    const lastUserMessage =
      currentMessages[currentMessages.length - 1 - lastUserMessageIndex];

    // If last message is assistant, remove it before regenerating
    if (lastMessage.role === 'assistant') {
      setMessages(
        activeConversationId,
        currentMessages.slice(0, -1)
      );
    }

    setPendingConversation(activeConversationId);

    try {
      const response = await api.post<ChatResponseData>(
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
  }, [activeConversationId, user, setMessages, addMessage, setPendingConversation, queryClient]);

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
    if (typeof window !== 'undefined') {
        window.localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    }
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
