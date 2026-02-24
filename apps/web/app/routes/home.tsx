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
import type { Message, MessageFile } from '@chatwithme/shared';

const ACTIVE_CONVERSATION_STORAGE_KEY = 'chatwithme-active-conversation-id';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'chatwithme-sidebar-collapsed';

export default function Home() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
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
    setConversations,
    addConversation,
    updateConversation,
    removeConversation,
    setActiveConversation,
    setMessages,
    addMessage,
    setLoading,
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

    // Use setTimeout to ensure virtual keyboard layout is complete
    const timer = setTimeout(() => {
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
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }, 100);

    restoreScrollConversationIdRef.current = null;
    return () => clearTimeout(timer);
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
  }, [activeConversationId, currentMessages.length]);

  useEffect(() => {
    if (!activeConversationId) return;
    window.localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, activeConversationId);
  }, [activeConversationId]);

  useEffect(() => {
    const saved = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (saved === 'true') {
      setSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

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

  const handleSidebarToggle = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setSidebarCollapsed((prev) => !prev);
      return;
    }
    setSidebarOpen(true);
  };

  const handleDeleteConversation = async (id: string) => {
    if (deletingConversationId) return;
    setDeletingConversationId(id);
    try {
      const response = await api.delete(`/chat/conversations/${id}`);
      if (response.success) {
        removeConversation(id);
      }
    } finally {
      setDeletingConversationId(null);
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

  const handleSendMessage = async (message: string, files?: MessageFile[]) => {
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
  };

  const handleQuickReply = async (question: string) => {
    if (!question.trim() || isLoading) return;
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
        className={`fixed z-50 h-full w-[90vw] max-w-[85vw] border-r border-border bg-card/95 backdrop-blur-xl transform transition-[transform,width,border] lg:relative lg:z-0 lg:max-w-none lg:transform-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${
          sidebarCollapsed
            ? 'lg:w-0 lg:min-w-0 lg:border-r-0 lg:overflow-hidden'
            : 'lg:w-72'
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
          deletingId={deletingConversationId}
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
              onClick={handleSidebarToggle}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
          {currentMessages.length === 0 ? (
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
                  isLast={index === currentMessages.length - 1}
                  onRegenerate={handleRegenerate}
                  onQuickReply={handleQuickReply}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <MessageInput
          onSend={handleSendMessage}
          disabled={isLoading}
          autoFocus
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
