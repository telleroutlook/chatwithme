import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '~/stores/auth';
import { useChatStore } from '~/stores/chat';
import { useThemeStore } from '~/stores/theme';
import { useTranslation } from '~/i18n';
import { MessageInput } from '~/components/chat/MessageInput';
import { Header } from './Header';
import { MessageList } from './MessageList';
import { Sidebar } from './Sidebar';
import { useChatActions } from './hooks';
import { useConversations } from '~/hooks/useConversations';
import { useMessages } from '~/hooks/useMessages';
import { cn } from '~/lib/utils';
import { useEdgeSwipe } from '~/hooks/useTouchGesture';
import { MessageActions } from '~/components/chat/MessageActions';
import { useMessageActions } from '~/components/chat/useMessageActions';
import { useSidebarState } from '~/hooks/useSidebarState';
import { useMobileViewport } from '~/hooks/useMobileViewport';
import { useAuthGuard } from '~/hooks/useAuthGuard';
import { useThemeCycle } from '~/hooks/useThemeCycle';
import { MobileSidebarOverlay } from '~/components/layout/MobileSidebarOverlay';
import { SidebarDragHandle } from '~/components/layout/SidebarDragHandle';
import { NewChatButton } from '~/components/chat/NewChatButton';

/**
 * Home Page Component
 *
 * Main chat interface with sidebar, message list, and input.
 * Handles authentication guard, theme cycling, and mobile viewport adaptation.
 */
export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // Sidebar State
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const { sidebarWidth, sidebarCollapsed, isResizing, startResizing, toggleSidebar } =
    useSidebarState();

  // Mobile viewport adaptation
  useMobileViewport();

  // Theme cycling
  const onThemeCycle = useThemeCycle();

  // Message actions menu state
  const { activeMenu, showMenu, hideMenu } = useMessageActions();

  const { user } = useAuthStore();
  const { mode: themeMode } = useThemeStore();
  const {
    conversations: storeConversations,
    activeConversationId,
    messages,
    isLoading,
  } = useChatStore();

  // Chat actions
  const {
    loadConversations,
    restoreActiveConversation,
    handleCreateConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
    handleSendMessage,
    handleRegenerate,
    handleQuickReply,
    handleExportChat,
    handleLogout,
  } = useChatActions();

  // Auth guard with data loading
  const { isLoading: isAuthLoading } = useAuthGuard(loadConversations);

  // React Query data fetching
  const queryEnabled = !isAuthLoading;
  const { data: conversationsData = [] } = useConversations(queryEnabled);
  const { data: messagesData = [] } = useMessages(activeConversationId, queryEnabled);

  // Restore active conversation when conversations data is loaded
  useEffect(() => {
    if (conversationsData.length > 0 && queryEnabled) {
      restoreActiveConversation(conversationsData);
    }
  }, [conversationsData, queryEnabled, restoreActiveConversation]);

  // Use React Query data when available, otherwise fall back to store data
  const conversations = conversationsData.length > 0 ? conversationsData : storeConversations;
  const currentMessages = useMemo(() => {
    const storedMessages = activeConversationId ? messages[activeConversationId] || [] : [];
    if (storedMessages.length === 0 && messagesData.length > 0) {
      return messagesData;
    }
    return storedMessages;
  }, [activeConversationId, messages, messagesData]);

  const onSidebarToggle = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      toggleSidebar();
    } else {
      setSidebarOpen(true);
    }
  }, [toggleSidebar]);

  const onDelete = useCallback(
    async (id: string) => {
      if (deletingConversationId) return;
      setDeletingConversationId(id);
      try {
        await handleDeleteConversation(id);
      } finally {
        setDeletingConversationId(null);
      }
    },
    [deletingConversationId, handleDeleteConversation]
  );

  // Edge swipe: swipe from left edge to open sidebar on mobile
  useEdgeSwipe({
    onSwipeRight: () => {
      if (typeof window !== 'undefined' && window.innerWidth < 1024 && !sidebarOpen) {
        setSidebarOpen(true);
      }
    },
    enabled: !sidebarOpen,
  });

  // Memoized callbacks to stabilize props passed to children
  const handleExport = useCallback(() => {
    handleExportChat(currentMessages, activeConversationId, conversations);
  }, [currentMessages, activeConversationId, conversations, handleExportChat]);

  const handleSettings = useCallback(() => {
    navigate('/settings');
  }, [navigate]);

  const handleSidebarSelectConversation = useCallback(
    (id: string) => {
      handleSelectConversation(id);
      setSidebarOpen(false);
    },
    [handleSelectConversation]
  );

  // Mobile: Create new conversation and close sidebar
  const handleMobileNewChat = useCallback(async () => {
    await handleCreateConversation();
    setSidebarOpen(false);
  }, [handleCreateConversation]);

  // Wait for hydration to complete before rendering
  if (isAuthLoading) {
    return null;
  }

  const currentTitle =
    conversations.find((c) => c.id === activeConversationId)?.title || t('chat.sidebar.newChat');

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
          'flex h-dvh w-full overflow-hidden bg-background font-sans selection:bg-primary/10',
          isResizing && 'cursor-col-resize select-none'
        )}
      >
        {/* Mobile Overlay */}
        <MobileSidebarOverlay isOpen={sidebarOpen} onClick={() => setSidebarOpen(false)} />

        {/* Mobile Sidebar */}
        <div className="lg:hidden">
          <Sidebar
            isOpen={sidebarOpen}
            isCollapsed={false}
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
        </div>

        {/* Sidebar - Desktop Resizable Container */}
        <aside
          style={{ width: sidebarCollapsed ? 0 : `${sidebarWidth}px` }}
          className={cn(
            'relative shrink-0 overflow-hidden border-r border-border bg-card flex flex-col h-full z-30',
            !isResizing && 'transition-[width] duration-300 ease-in-out',
            sidebarCollapsed && 'lg:w-0 lg:border-r-0',
            'hidden lg:flex'
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
        <SidebarDragHandle collapsed={sidebarCollapsed} onMouseDown={startResizing} />

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
            onSettings={handleSettings}
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

          <footer className="shrink-0 px-1 pb-4 pt-0 sm:p-4 sm:pt-0">
            <div className="mx-auto w-full max-w-[1400px] px-1 sm:px-4 lg:px-6">
              {/* New chat button - both mobile and desktop */}
              <div className="mb-2">
                <NewChatButton
                  onClick={handleMobileNewChat}
                  disabled={isLoading}
                  className="sm:hidden"
                />
                <div className="hidden sm:block">
                  <NewChatButton onClick={handleMobileNewChat} disabled={isLoading} />
                </div>
              </div>

              <MessageInput
                onSend={handleSendMessage}
                disabled={isLoading}
                autoFocus
                placeholder={
                  activeConversationId ? t('chat.input.placeholder') : t('chat.empty.getStarted')
                }
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
