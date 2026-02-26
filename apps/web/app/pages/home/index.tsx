import { useEffect, useState, useCallback, useMemo, useRef, memo } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '~/stores/auth';
import { useChatStore } from '~/stores/chat';
import { type ThemeMode, useThemeStore } from '~/stores/theme';
import { MessageInput } from '~/components/chat/MessageInput';
import { Header } from './Header';
import { MessageList } from './MessageList';
import { Sidebar } from './Sidebar';
import { useChatActions } from './hooks';
import { useConversations } from '~/hooks/useConversations';
import { useMessages } from '~/hooks/useMessages';
import { cn } from '~/lib/utils';
import { useEdgeSwipe, useTouchGesture } from '~/hooks/useTouchGesture';
import { useMessageActions } from '~/components/chat/MessageActions';
import { MessageActions } from '~/components/chat/MessageActions';

const SIDEBAR_WIDTH_KEY = 'chatwithme-sidebar-width';
const SIDEBAR_COLLAPSED_KEY = 'chatwithme-sidebar-collapsed';
const CONFIG = {
  MIN_WIDTH: 220,
  DEFAULT_WIDTH: 280,
  MAX_WIDTH: 450,
};

export function Home() {
  const navigate = useNavigate();
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // Sidebar State
  const [sidebarWidth, setSidebarWidth] = useState(CONFIG.DEFAULT_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile drawer
  const [isResizing, setIsResizing] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);

  // Message actions menu state
  const { activeMenu, showMenu, hideMenu } = useMessageActions();

  const { isAuthenticated, hasHydrated, user } = useAuthStore();
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const { conversations: storeConversations, activeConversationId, messages, isLoading } = useChatStore();

  // React Query hooks for data fetching with caching
  const { data: conversationsData = [] } = useConversations();
  const { data: messagesData = [] } = useMessages(activeConversationId);

  // Use React Query data when available, otherwise fall back to store data
  const conversations = conversationsData.length > 0 ? conversationsData : storeConversations;
  // For messages, we use a hybrid approach: React Query for initial load, store for real-time updates
  const currentMessages = useMemo(() => {
    // If we have messages in the store (from send/regenerate), use those
    const storedMessages = activeConversationId ? messages[activeConversationId] || [] : [];
    // If React Query has data and we don't have store updates, use React Query data
    if (storedMessages.length === 0 && messagesData.length > 0) {
      return messagesData;
    }
    return storedMessages;
  }, [activeConversationId, messages, messagesData]);

  const {
    loadConversations, loadMessages, handleCreateConversation,
    handleSelectConversation, handleDeleteConversation,
    handleRenameConversation, handleSendMessage,
    handleRegenerate, handleQuickReply, handleExportChat, handleLogout,
  } = useChatActions();

  // Persistence & Initial Load - moved to useEffect to avoid hydration issues
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const savedCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (savedWidth) setSidebarWidth(Math.min(parseInt(savedWidth, 10), CONFIG.MAX_WIDTH));
    if (savedCollapsed === 'true') setSidebarCollapsed(true);
  }, []);

  // Resize Handling
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  const resize = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const newWidth = e.clientX;
    if (newWidth >= CONFIG.MIN_WIDTH && newWidth <= CONFIG.MAX_WIDTH) {
      setSidebarWidth(newWidth);
    }
  }, [isResizing]);

  useEffect(() => {
    if (!isResizing) return;
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // Auth & Data sync
  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) navigate('/signin');
    else loadConversations();
  }, [hasHydrated, isAuthenticated, navigate, loadConversations]);

  // Visual Viewport API for mobile keyboard adaptation
  useEffect(() => {
    if (typeof window === 'undefined' || !('visualViewport' in window)) return;

    const viewport = window.visualViewport!;
    const handleResize = () => {
      // Set CSS custom property for visual viewport height
      document.documentElement.style.setProperty('--visual-viewport-height', `${viewport.height}px`);
    };

    // Initial set
    handleResize();

    viewport.addEventListener('resize', handleResize);
    return () => viewport.removeEventListener('resize', handleResize);
  }, []);

  // Note: React Query's useMessages hook automatically fetches when activeConversationId changes
  // No need for manual loadMessages effect here

  const onSidebarToggle = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      const newState = !sidebarCollapsed;
      setSidebarCollapsed(newState);
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newState));
    } else {
      setSidebarOpen(true);
    }
  }, [sidebarCollapsed]);

  const onThemeCycle = useCallback(() => {
    const order: ThemeMode[] = ['system', 'dark', 'light'];
    setThemeMode(order[(order.indexOf(themeMode) + 1) % order.length]);
  }, [themeMode, setThemeMode]);

  const onDelete = useCallback(async (id: string) => {
    if (deletingConversationId) return;
    setDeletingConversationId(id);
    try {
      await handleDeleteConversation(id);
    } finally {
      setDeletingConversationId(null);
    }
  }, [deletingConversationId, handleDeleteConversation]);

  // Edge swipe: swipe from left edge to open sidebar on mobile
  useEdgeSwipe({
    onSwipeRight: () => {
      if (typeof window !== 'undefined' && window.innerWidth < 1024 && !sidebarOpen) {
        setSidebarOpen(true);
      }
    },
    enabled: !sidebarOpen,
  });

  // Wait for hydration to complete before rendering
  if (typeof window === 'undefined' || !hasHydrated || !isAuthenticated) {
    return null;
  }

  const currentTitle = conversations.find((c) => c.id === activeConversationId)?.title || 'New Chat';

  // Memoized callbacks to stabilize props passed to children
  const handleExport = useCallback(() => {
    handleExportChat(currentMessages, activeConversationId, conversations);
  }, [currentMessages, activeConversationId, conversations, handleExportChat]);

  const handleSidebarSelectConversation = useCallback((id: string) => {
    handleSelectConversation(id);
    setSidebarOpen(false);
  }, [handleSelectConversation]);

  return (
    <>
      {/* Message actions menu (rendered at root level) */}
      {activeMenu && (
        <MessageActions
          messageId={activeMenu.messageId}
          content={activeMenu.content}
          position={activeMenu.position}
          onClose={hideMenu}
          onCopy={() => {
            // Copy is handled inside the component
          }}
        />
      )}

      <div
        ref={mainContainerRef}
        className={cn(
          "flex h-dvh w-full overflow-hidden bg-background font-sans selection:bg-primary/10",
          isResizing && "cursor-col-resize select-none"
        )}
      >
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden animate-in fade-in duration-200" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      {/* Sidebar - Desktop Resizable Container */}
      <aside
        style={{ width: sidebarCollapsed ? 0 : `${sidebarWidth}px` }}
        className={cn(
          "relative shrink-0 overflow-hidden border-r border-border bg-card flex flex-col h-full z-30",
          !isResizing && "transition-[width] duration-300 ease-in-out",
          sidebarCollapsed && "lg:w-0 lg:border-r-0",
          "hidden lg:flex"
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
          onSelect={handleSidebarSelectConversation}
          onCreate={handleCreateConversation}
          onDelete={onDelete}
          onRename={handleRenameConversation}
        />
      </aside>

      {/* Drag Handle */}
      {!sidebarCollapsed && (
        <div
          onMouseDown={startResizing}
          className="hidden lg:flex w-1 hover:w-1.5 active:w-1.5 transition-all cursor-col-resize items-center justify-center z-40 group -ml-[2px]"
        >
          <div className="h-10 w-[2px] rounded-full bg-border group-hover:bg-primary/50 group-active:bg-primary transition-colors" />
        </div>
      )}

      {/* Main Area */}
      <main className="flex min-w-0 flex-1 flex-col relative z-10">
        <Header
          title={currentTitle}
          userEmail={user?.email}
          themeMode={themeMode}
          currentMessagesLength={currentMessages.length}
          onSidebarToggle={onSidebarToggle}
          onThemeToggle={onThemeCycle}
          onExport={handleExport}
          onLogout={handleLogout}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="flex-1 min-h-0 relative flex flex-col">
          <MessageList
            messages={currentMessages}
            activeConversationId={activeConversationId}
            onRegenerate={() => handleRegenerate(currentMessages)}
            onQuickReply={(q) => handleQuickReply(q, isLoading)}
            onShowMessageMenu={showMenu}
          />
        </div>

        <footer className="shrink-0 p-4 pt-0">
          <div className="mx-auto max-w-4xl">
            <MessageInput
              onSend={handleSendMessage}
              disabled={isLoading}
              autoFocus
              placeholder={activeConversationId ? 'Message ChatWithMe...' : 'Start a new conversation...'}
            />
            <p className="mt-2 text-center text-[10px] text-muted-foreground/50">
              AI can make mistakes. Check important info.
            </p>
          </div>
        </footer>
      </main>
    </div>
    </>
  );
}

export default Home;
