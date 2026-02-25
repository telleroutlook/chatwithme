import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '~/stores/auth';
import { useChatStore } from '~/stores/chat';
import { type ThemeMode, useThemeStore } from '~/stores/theme';
import { MessageInput } from '~/components/chat/MessageInput';
import { Header } from './Header';
import { MessageList } from './MessageList';
import { Sidebar } from './Sidebar';
import { useChatActions } from './hooks';
import { cn } from '~/lib/utils';

const SIDEBAR_WIDTH_STORAGE_KEY = 'chatwithme-sidebar-width';
const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 500;

export function Home() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);

  const { isAuthenticated, hasHydrated, user } = useAuthStore();
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const { conversations, activeConversationId, messages, isLoading } = useChatStore();
  const {
    loadConversations, loadMessages, handleCreateConversation,
    handleSelectConversation: chatActionsHandleSelectConversation,
    handleDeleteConversation: chatActionsHandleDeleteConversation,
    handleRenameConversation, handleSendMessage,
    handleRegenerate: chatActionsHandleRegenerate,
    handleQuickReply, handleExportChat, handleLogout,
  } = useChatActions();

  const currentMessages = activeConversationId ? messages[activeConversationId] || [] : [];

  useEffect(() => {
    const savedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (savedWidth) setSidebarWidth(parseInt(savedWidth, 10));
  }, []);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = e.clientX;
      if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) navigate('/signin');
  }, [hasHydrated, isAuthenticated, navigate]);

  useEffect(() => {
    if (hasHydrated && isAuthenticated) loadConversations();
  }, [hasHydrated, isAuthenticated, loadConversations]);

  useEffect(() => {
    if (activeConversationId && !messages[activeConversationId]) loadMessages(activeConversationId);
  }, [activeConversationId, messages, loadMessages]);

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

  if (!hasHydrated || !isAuthenticated) return null;

  const title = conversations.find((c) => c.id === activeConversationId)?.title || 'New Chat';

  return (
    <div className={`flex h-dvh w-full overflow-hidden bg-background ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar Container - HARD GRID PROTECTION */}
      <div 
        style={{ width: sidebarCollapsed ? 0 : `${sidebarWidth}px`, minWidth: sidebarCollapsed ? 0 : undefined }}
        className={cn(
          "shrink-0 lg:relative lg:z-20 border-r border-border bg-card flex flex-col h-full",
          !isResizing && "transition-[width] duration-300 ease-in-out",
          sidebarCollapsed && "lg:border-r-0 lg:w-0"
        )}
      >
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
          onDelete={async (id) => {
            if (deletingConversationId) return;
            setDeletingConversationId(id);
            try { await chatActionsHandleDeleteConversation(id); } finally { setDeletingConversationId(null); }
          }}
          onRename={handleRenameConversation}
        />
      </div>

      {/* Resize Handle */}
      {!sidebarCollapsed && (
        <div
          onMouseDown={startResizing}
          className="hidden lg:flex w-1 hover:w-1.5 transition-all cursor-col-resize items-center justify-center z-30 group"
          style={{ marginLeft: '-2px' }}
        >
          <div className="h-12 w-1 rounded-full bg-border group-hover:bg-primary transition-colors" />
        </div>
      )}

      {/* Main Content - GUARANTEED MIN WIDTH */}
      <main className="flex min-w-[320px] flex-1 flex-col relative z-10 bg-background overflow-hidden">
        <Header
          title={title}
          userEmail={user?.email}
          themeMode={themeMode}
          currentMessagesLength={currentMessages.length}
          onSidebarToggle={handleSidebarToggle}
          onThemeToggle={() => {
            const order: ThemeMode[] = ['system', 'dark', 'light'];
            setThemeMode(order[(order.indexOf(themeMode) + 1) % order.length]);
          }}
          onExport={() => handleExportChat(currentMessages, activeConversationId, conversations)}
          onLogout={handleLogout}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="flex-1 min-h-0 relative">
          <MessageList
            messages={currentMessages}
            activeConversationId={activeConversationId}
            onRegenerate={() => chatActionsHandleRegenerate(currentMessages)}
            onQuickReply={(question) => handleQuickReply(question, isLoading)}
          />
        </div>

        <div className="shrink-0 bg-background/80 backdrop-blur-md border-t border-border/50">
          <MessageInput
            onSend={handleSendMessage}
            disabled={isLoading}
            autoFocus
            placeholder={activeConversationId ? 'Type a message...' : 'Start a new conversation...'}
          />
        </div>
      </main>
    </div>
  );
}

export default Home;
