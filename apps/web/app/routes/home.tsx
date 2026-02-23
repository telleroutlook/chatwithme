import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Menu, LogOut, X, Download } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '~/stores/auth';
import { useChatStore } from '~/stores/chat';
import { api } from '~/client';
import { Button } from '~/components/ui/button';
import { ConversationList } from '~/components/chat/ConversationList';
import { ChatBubble } from '~/components/chat/ChatBubble';
import { MessageInput } from '~/components/chat/MessageInput';
import { ScrollArea } from '~/components/ui/scroll-area';
import { exportChatToHtml } from '~/lib/chatExport';
import type { Message, MessageFile } from '@chatwithme/shared';

export default function Home() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const streamingContentRef = useRef('');

  const { user, tokens, isAuthenticated, logout } = useAuthStore();
  const {
    conversations,
    activeConversationId,
    messages,
    isLoading,
    isStreaming,
    streamingMessage,
    setConversations,
    addConversation,
    removeConversation,
    setActiveConversation,
    setMessages,
    addMessage,
    appendToStreamingMessage,
    clearStreamingMessage,
    setLoading,
    setStreaming,
  } = useChatStore();

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/signin');
    }
  }, [isAuthenticated, navigate]);

  // Load conversations on mount
  useEffect(() => {
    if (isAuthenticated) {
      loadConversations();
    }
  }, [isAuthenticated]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConversationId && !messages[activeConversationId]) {
      loadMessages(activeConversationId);
    }
  }, [activeConversationId]);

  const loadConversations = async () => {
    const response = await api.get<{ conversations: typeof conversations }>('/chat/conversations');
    if (response.success && response.data) {
      setConversations(response.data.conversations);
    }
  };

  const loadMessages = async (conversationId: string) => {
    setLoading(true);
    const response = await api.get<{ messages: Message[] }>(
      `/chat/conversations/${conversationId}/messages`
    );
    if (response.success && response.data) {
      setMessages(conversationId, response.data.messages);
    }
    setLoading(false);
  };

  const handleCreateConversation = async () => {
    const response = await api.post<{ conversation: typeof conversations[0] }>(
      '/chat/conversations',
      {}
    );
    if (response.success && response.data) {
      addConversation(response.data.conversation);
    }
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversation(id);
    setSidebarOpen(false);
  };

  const handleDeleteConversation = async (id: string) => {
    await api.delete(`/chat/conversations/${id}`);
    removeConversation(id);
  };

  const handleRenameConversation = async (id: string, title: string) => {
    await api.patch(`/chat/conversations/${id}`, { title });
  };

  const handleSendMessage = useCallback(
    async (message: string, files?: MessageFile[]) => {
      if (!activeConversationId) {
        // Create a new conversation first
        const response = await api.post<{ conversation: typeof conversations[0] }>(
          '/chat/conversations',
          {}
        );
        if (response.success && response.data) {
          addConversation(response.data.conversation);
        }
        return;
      }

      // Add user message immediately
      const userMessage: Message = {
        id: crypto.randomUUID(),
        userId: user?.id || '',
        conversationId: activeConversationId,
        role: 'user',
        message,
        files: files || [],
        generatedImageUrls: [],
        searchResults: [],
        createdAt: new Date(),
      };
      addMessage(activeConversationId, userMessage);

      // Start streaming
      setStreaming(true);
      clearStreamingMessage();
      streamingContentRef.current = '';

      try {
        await api.stream(
          '/chat/stream',
          {
            conversationId: activeConversationId,
            message,
            files,
          },
          (content) => {
            streamingContentRef.current += content;
            appendToStreamingMessage(content);
          },
          () => {
            // Save the complete message using ref value
            const assistantMessage: Message = {
              id: crypto.randomUUID(),
              userId: user?.id || '',
              conversationId: activeConversationId,
              role: 'assistant',
              message: streamingContentRef.current,
              files: null,
              generatedImageUrls: null,
              searchResults: null,
              createdAt: new Date(),
            };
            addMessage(activeConversationId, assistantMessage);
            clearStreamingMessage();
            setStreaming(false);
          },
          (error) => {
            console.error('Stream error:', error);
            setStreaming(false);
          }
        );
      } catch (error) {
        console.error('Send message error:', error);
        setStreaming(false);
      }
    },
    [activeConversationId, user?.id]
  );

  const handleLogout = async () => {
    if (tokens?.refreshToken) {
      await api.post('/auth/signout', { refreshToken: tokens.refreshToken }, { withAuth: false });
    }
    logout();
    navigate('/signin');
  };

  const handleExportChat = () => {
    if (!activeConversationId || currentMessages.length === 0) return;
    const title =
      conversations.find((c) => c.id === activeConversationId)?.title || 'Chat';
    exportChatToHtml(currentMessages, title);
  };

  const handleRegenerate = useCallback(async () => {
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

    // Re-send the last user message
    setStreaming(true);
    clearStreamingMessage();
    streamingContentRef.current = '';

    try {
      await api.stream(
        '/chat/stream',
        {
          conversationId: activeConversationId,
          message: lastUserMessage.message,
          files: lastUserMessage.files || undefined,
        },
        (content) => {
          streamingContentRef.current += content;
          appendToStreamingMessage(content);
        },
        () => {
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            userId: user?.id || '',
            conversationId: activeConversationId,
            role: 'assistant',
            message: streamingContentRef.current,
            files: null,
            generatedImageUrls: null,
            searchResults: null,
            createdAt: new Date(),
          };
          addMessage(activeConversationId, assistantMessage);
          clearStreamingMessage();
          setStreaming(false);
        },
        (error) => {
          console.error('Regenerate stream error:', error);
          setStreaming(false);
        }
      );
    } catch (error) {
      console.error('Regenerate error:', error);
      setStreaming(false);
    }
  }, [activeConversationId, currentMessages, user?.id]);

  if (!isAuthenticated) {
    return null;
  }

  const currentMessages = activeConversationId ? messages[activeConversationId] || [] : [];

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:relative z-50 lg:z-0 w-72 h-full bg-card border-r border-border transform transition-transform lg:transform-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-border lg:hidden">
          <h1 className="font-semibold text-lg">ChatWithMe</h1>
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <ConversationList
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          onCreate={handleCreateConversation}
          onDelete={handleDeleteConversation}
          onRename={handleRenameConversation}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="font-semibold text-lg truncate">
              {conversations.find((c) => c.id === activeConversationId)?.title || 'New Chat'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleExportChat}
              disabled={currentMessages.length === 0}
              title="Export chat"
            >
              <Download className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Messages */}
        <ScrollArea className="flex-1">
          {currentMessages.length === 0 && !isStreaming ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
              <h2 className="text-2xl font-semibold mb-2">Welcome to ChatWithMe</h2>
              <p className="text-center max-w-md">
                Start a conversation by typing a message below. You can ask questions, get help
                with tasks, or just chat.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {currentMessages.map((msg, index) => (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  isLast={index === currentMessages.length - 1 && !isStreaming}
                  onRegenerate={handleRegenerate}
                />
              ))}
              {isStreaming && streamingMessage && (
                <ChatBubble
                  message={{ role: 'assistant', message: streamingMessage }}
                  isStreaming
                />
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <MessageInput
          onSend={handleSendMessage}
          disabled={isStreaming || isLoading}
          placeholder={
            activeConversationId
              ? 'Type a message...'
              : 'Start a new conversation...'
          }
        />
      </main>
    </div>
  );
}
