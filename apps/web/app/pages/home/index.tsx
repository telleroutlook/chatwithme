import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '~/stores/auth';
import { useChatStore } from '~/stores/chat';
import { type ThemeMode, useThemeStore } from '~/stores/theme';
import { MessageInput } from '~/components/chat/MessageInput';
import { Header } from './Header';
import { MessageList } from './MessageList';
import { Sidebar } from './Sidebar';
import { useChatActions } from './hooks';

const ACTIVE_CONVERSATION_STORAGE_KEY = 'chatwithme-active-conversation-id';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'chatwithme-sidebar-collapsed';

export function Home() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);

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

  const {
    loadConversations,
    loadMessages,
    handleCreateConversation,
    handleSelectConversation: chatActionsHandleSelectConversation,
    handleDeleteConversation: chatActionsHandleDeleteConversation,
    handleRenameConversation,
    handleSendMessage,
    handleRegenerate: chatActionsHandleRegenerate,
    handleQuickReply,
    handleExportChat,
    handleLogout,
  } = useChatActions();

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
  }, [hasHydrated, isAuthenticated, loadConversations]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConversationId && !messages[activeConversationId]) {
      loadMessages(activeConversationId);
    }
  }, [activeConversationId, messages, loadMessages]);

  // Persist active conversation ID
  useEffect(() => {
    if (!activeConversationId) return;
    window.localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, activeConversationId);
  }, [activeConversationId]);

  // Initialize sidebar collapsed state from localStorage
  useEffect(() => {
    const saved = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (saved === 'true') {
      setSidebarCollapsed(true);
    }
  }, []);

  // Persist sidebar collapsed state
  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (!sidebarOpen) return;
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const handleSelectConversation = (id: string) => {
    chatActionsHandleSelectConversation(id);
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
      await chatActionsHandleDeleteConversation(id);
    } finally {
      setDeletingConversationId(null);
    }
  };

  const handleRegenerate = async () => {
    await chatActionsHandleRegenerate(currentMessages);
  };

  const cycleThemeMode = () => {
    const order: ThemeMode[] = ['system', 'dark', 'light'];
    const index = order.indexOf(themeMode);
    const nextMode = order[(index + 1) % order.length];
    setThemeMode(nextMode);
  };

  const onExportChat = () => {
    handleExportChat(currentMessages, activeConversationId, conversations);
  };

  if (!hasHydrated || !isAuthenticated) {
    return null;
  }

  const title = conversations.find((c) => c.id === activeConversationId)?.title || 'New Chat';

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
      <Sidebar
        isOpen={sidebarOpen}
        isCollapsed={sidebarCollapsed}
        conversations={conversations}
        activeId={activeConversationId}
        deletingId={deletingConversationId}
        isLoading={isLoading}
        onClose={() => setSidebarOpen(false)}
        onSelect={handleSelectConversation}
        onCreate={handleCreateConversation}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
      />

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <Header
          title={title}
          userEmail={user?.email}
          themeMode={themeMode}
          currentMessagesLength={currentMessages.length}
          onSidebarToggle={handleSidebarToggle}
          onThemeToggle={cycleThemeMode}
          onExport={onExportChat}
          onLogout={handleLogout}
          sidebarCollapsed={sidebarCollapsed}
        />

        {/* Messages */}
        <MessageList
          messages={currentMessages}
          activeConversationId={activeConversationId}
          onRegenerate={handleRegenerate}
          onQuickReply={(question) => handleQuickReply(question, isLoading)}
        />

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

// Default export for backward compatibility - rebuild v2
export default Home;
