import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Menu, LogOut, X, Download, Moon, Sun, Monitor } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '~/stores/auth';
import { useChatStore } from '~/stores/chat';
import { type ThemeMode, useThemeStore } from '~/stores/theme';
import { api } from '~/client';
import { Button } from '~/components/ui/button';
import { ConversationList } from '~/components/chat/ConversationList';
import { ChatBubble } from '~/components/chat/ChatBubble';
import { MessageInput } from '~/components/chat/MessageInput';
import { ScrollArea } from '~/components/ui/scroll-area';
import { exportChatToHtml } from '~/lib/chatExport';
import { ensureConversationId } from '~/lib/chatFlow';
import type { Message, MessageFile, ThinkMode } from '@chatwithme/shared';

const THINK_MODE_STORAGE_KEY = 'chatwithme-think-mode';
const ACTIVE_CONVERSATION_STORAGE_KEY = 'chatwithme-active-conversation-id';
const THINK_MODE_VALUES: ThinkMode[] = ['instant', 'think', 'deepthink'];

export default function Home() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [thinkMode, setThinkMode] = useState<ThinkMode>('think');
  const streamingContentRef = useRef('');
  const streamingSuggestionsRef = useRef<string[]>([]);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const restoreScrollConversationIdRef = useRef<string | null>(null);
  const skipNextAutoScrollRef = useRef(false);

  const { user, tokens, isAuthenticated, hasHydrated, logout } = useAuthStore();
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const {
    conversations,
    activeConversationId,
    messages,
    isLoading,
    isStreaming,
    streamingMessage,
    setConversations,
    addConversation,
    updateConversation,
    removeConversation,
    setActiveConversation,
    setMessages,
    addMessage,
    appendToStreamingMessage,
    clearStreamingMessage,
    setLoading,
    setStreaming,
  } = useChatStore();
  const currentMessages = activeConversationId ? messages[activeConversationId] || [] : [];

  // Redirect if not authenticated
  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      navigate('/signin');
    }
  }, [hasHydrated, isAuthenticated, navigate]);

  // Load conversations on mount
  useEffect(() => {
    if (hasHydrated && isAuthenticated) {
      loadConversations();
    }
  }, [hasHydrated, isAuthenticated]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConversationId && !messages[activeConversationId]) {
      loadMessages(activeConversationId);
    }
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) return;
    if (restoreScrollConversationIdRef.current !== activeConversationId) return;
    if (currentMessages.length === 0) {
      restoreScrollConversationIdRef.current = null;
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const viewport = messageScrollRef.current?.querySelector<HTMLElement>(
        '[data-radix-scroll-area-viewport]'
      );
      if (viewport) {
        const lastUserMessage = [...currentMessages].reverse().find((message) => message.role === 'user');
        const targetMessage = lastUserMessage ?? currentMessages[0];
        const targetElement = viewport.querySelector<HTMLElement>(
          `[data-message-id="${targetMessage.id}"]`
        );

        if (targetElement) {
          skipNextAutoScrollRef.current = true;
          targetElement.scrollIntoView({ block: 'start' });
        }
      }
    });

    restoreScrollConversationIdRef.current = null;
    return () => window.cancelAnimationFrame(frame);
  }, [activeConversationId, currentMessages]);

  useEffect(() => {
    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }

    if (!activeConversationId) return;
    if (restoreScrollConversationIdRef.current === activeConversationId) return;

    const frame = window.requestAnimationFrame(() => {
      const viewport = messageScrollRef.current?.querySelector<HTMLElement>(
        '[data-radix-scroll-area-viewport]'
      );
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeConversationId, currentMessages.length, isStreaming, streamingMessage]);

  useEffect(() => {
    window.localStorage.setItem(THINK_MODE_STORAGE_KEY, thinkMode);
  }, [thinkMode]);

  useEffect(() => {
    if (activeConversationId) {
      window.localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, activeConversationId);
      return;
    }

    window.localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
  }, [activeConversationId]);

  useEffect(() => {
    const savedMode = window.localStorage.getItem(THINK_MODE_STORAGE_KEY);
    if (savedMode && THINK_MODE_VALUES.includes(savedMode as ThinkMode)) {
      setThinkMode(savedMode as ThinkMode);
    }
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const loadConversations = async () => {
    const response = await api.get<{ conversations: typeof conversations }>('/chat/conversations');
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
  };

  const loadMessages = async (conversationId: string) => {
    setLoading(true);
    restoreScrollConversationIdRef.current = conversationId;
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
    const response = await api.delete(`/chat/conversations/${id}`);
    if (response.success) {
      removeConversation(id);
    }
  };

  const handleRenameConversation = async (id: string, title: string) => {
    const response = await api.patch(`/chat/conversations/${id}`, { title });
    if (response.success) {
      updateConversation(id, { title });
    }
  };

  const ensureConversation = async (): Promise<string | null> =>
    ensureConversationId({
      activeConversationId,
      createConversation: async () => {
        const response = await api.post<{ conversation: typeof conversations[number] }>(
          '/chat/conversations',
          {}
        );
        if (!response.success || !response.data) {
          return null;
        }
        return response.data.conversation;
      },
      onConversationCreated: addConversation,
    });

  const handleSendMessage = async (
    message: string,
    files?: MessageFile[],
    selectedThinkMode: ThinkMode = thinkMode
  ) => {
    const conversationId = await ensureConversation();
    if (!conversationId) return;

      // Add user message immediately
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

      // Start streaming
      setStreaming(true);
      clearStreamingMessage();
      streamingContentRef.current = '';
      streamingSuggestionsRef.current = [];

    try {
      await api.stream(
        '/chat/stream',
        {
          conversationId,
          message,
          files,
          thinkMode: selectedThinkMode,
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
              conversationId,
              role: 'assistant',
              message: streamingContentRef.current,
              files: [],
              generatedImageUrls: [],
              searchResults: [],
              suggestions: streamingSuggestionsRef.current,
              createdAt: new Date(),
            };
            addMessage(conversationId, assistantMessage);
            clearStreamingMessage();
            setStreaming(false);
          },
          (error) => {
            console.error('Stream error:', error);
            clearStreamingMessage();
            const errorMessage: Message = {
              id: crypto.randomUUID(),
              userId: user?.id || '',
              conversationId,
              role: 'assistant',
              message: `抱歉，回复失败：${error}`,
              files: [],
              generatedImageUrls: [],
              searchResults: [],
              createdAt: new Date(),
            };
            addMessage(conversationId, errorMessage);
            setStreaming(false);
          },
          (suggestions) => {
            streamingSuggestionsRef.current = suggestions;
          }
      );
    } catch (error) {
      console.error('Send message error:', error);
      setStreaming(false);
    }
  };

  const handleLogout = async () => {
    if (tokens?.refreshToken) {
      await api.post('/auth/signout', { refreshToken: tokens.refreshToken }, { withAuth: false });
    }
    window.localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    logout();
    navigate('/signin');
  };

  const handleExportChat = () => {
    if (!activeConversationId || currentMessages.length === 0) return;
    const title =
      conversations.find((c) => c.id === activeConversationId)?.title || 'Chat';
    exportChatToHtml(currentMessages, title);
  };

  const handleRegenerate = async () => {
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
    streamingSuggestionsRef.current = [];

    try {
      await api.stream(
        '/chat/stream',
        {
          conversationId: activeConversationId,
          message: lastUserMessage.message,
          files: lastUserMessage.files || undefined,
          thinkMode,
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
            files: [],
            generatedImageUrls: [],
            searchResults: [],
            suggestions: streamingSuggestionsRef.current,
            createdAt: new Date(),
          };
          addMessage(activeConversationId, assistantMessage);
          clearStreamingMessage();
          setStreaming(false);
        },
        (error) => {
          console.error('Regenerate stream error:', error);
          clearStreamingMessage();
          const errorMessage: Message = {
            id: crypto.randomUUID(),
            userId: user?.id || '',
            conversationId: activeConversationId,
            role: 'assistant',
            message: `抱歉，重新生成失败：${error}`,
            files: [],
            generatedImageUrls: [],
            searchResults: [],
            createdAt: new Date(),
          };
          addMessage(activeConversationId, errorMessage);
          setStreaming(false);
        },
        (suggestions) => {
          streamingSuggestionsRef.current = suggestions;
        }
      );
    } catch (error) {
      console.error('Regenerate error:', error);
      setStreaming(false);
    }
  };

  const handleQuickReply = async (question: string) => {
    if (!question.trim() || isStreaming || isLoading) return;
    await handleSendMessage(question);
  };

  const cycleThemeMode = () => {
    const order: ThemeMode[] = ['system', 'dark', 'light'];
    const index = order.indexOf(themeMode);
    const nextMode = order[(index + 1) % order.length];
    setThemeMode(nextMode);
  };

  const themeIcon =
    themeMode === 'light' ? <Sun className="h-4 w-4" /> : themeMode === 'dark' ? <Moon className="h-4 w-4" /> : <Monitor className="h-4 w-4" />;

  if (!hasHydrated || !isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-dvh bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed z-50 h-full w-[84vw] max-w-80 border-r border-border bg-card/95 backdrop-blur-xl transform transition-transform lg:relative lg:z-0 lg:w-72 lg:max-w-none lg:transform-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3 lg:hidden">
          <h1 className="text-base font-semibold">ChatWithMe</h1>
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
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-3 py-2.5 backdrop-blur-xl sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="truncate text-sm font-semibold sm:text-base">
              {conversations.find((c) => c.id === activeConversationId)?.title || 'New Chat'}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="hidden text-sm text-muted-foreground md:block">
              {user?.email}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={cycleThemeMode}
              title={`Theme: ${themeMode}`}
              aria-label={`Switch theme mode, current: ${themeMode}`}
            >
              {themeIcon}
            </Button>
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
        <ScrollArea ref={messageScrollRef} className="flex-1">
          {currentMessages.length === 0 && !isStreaming ? (
            <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-6 text-muted-foreground">
              <h2 className="mb-2 text-center text-2xl font-semibold sm:text-3xl">Welcome to ChatWithMe</h2>
              <p className="max-w-md text-center text-sm sm:text-base">
                Start a conversation by typing a message below. You can ask questions, get help
                with tasks, or just chat.
              </p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-4xl divide-y divide-border/80">
              {currentMessages.map((msg, index) => (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  messageId={msg.id}
                  isLast={index === currentMessages.length - 1 && !isStreaming}
                  onRegenerate={handleRegenerate}
                  onQuickReply={handleQuickReply}
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
          autoFocus
          thinkMode={thinkMode}
          onThinkModeChange={setThinkMode}
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
