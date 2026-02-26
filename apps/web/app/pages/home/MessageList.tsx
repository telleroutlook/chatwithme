import { ScrollArea } from '~/components/ui/scroll-area';
import { ChatBubble } from '~/components/chat/ChatBubble';
import { ChatErrorBoundary } from '~/components/error';
import { EmptyMessages } from '~/components/empty-state';
import { TypingIndicator } from '~/components/chat/TypingIndicator';
import type { Message } from '@chatwithme/shared';
import { useChatScroll } from './hooks/useChatScroll';
import { useChatStore } from '~/stores/chat';
import { useMemo, useCallback, memo } from 'react';
import { sanitizeMessages } from '~/lib/messageSanitizer';

export interface MessageListProps {
  messages: Message[];
  activeConversationId: string | null;
  onRegenerate: () => void;
  onQuickReply: (question: string) => void;
  onShowMessageMenu?: (
    messageId: string,
    content: string,
    position: { x: number; y: number }
  ) => void;
}

export const MessageList = memo(function MessageList({
  messages,
  activeConversationId,
  onRegenerate,
  onQuickReply,
  onShowMessageMenu,
}: MessageListProps) {
  const safeMessages = useMemo(() => sanitizeMessages(messages), [messages]);

  const { messageScrollRef } = useChatScroll({
    activeConversationId,
    currentMessages: safeMessages,
  });

  const { pendingConversationId } = useChatStore();
  const showTypingIndicator = pendingConversationId === activeConversationId;

  // Find the index of the last user message (memoized to avoid recalculation on every render)
  const actualLastUserMessageIndex = useMemo(() => {
    const lastUserMessageIndex = [...safeMessages]
      .reverse()
      .findIndex((msg) => msg.role === 'user');
    return lastUserMessageIndex === -1 ? -1 : safeMessages.length - 1 - lastUserMessageIndex;
  }, [safeMessages]);

  // Render function for virtual list items
  const renderMessage = useCallback(
    (message: Message, index: number) => (
      <ChatBubble
        key={message.id}
        message={message}
        messageId={message.id}
        isLast={index === safeMessages.length - 1}
        isLastUserMessage={index === actualLastUserMessageIndex}
        onRegenerate={onRegenerate}
        onQuickReply={onQuickReply}
        onLongPress={onShowMessageMenu}
      />
    ),
    [safeMessages.length, actualLastUserMessageIndex, onRegenerate, onQuickReply, onShowMessageMenu]
  );

  if (safeMessages.length === 0) {
    return <EmptyMessages />;
  }

  return (
    <ScrollArea ref={messageScrollRef} className="h-full w-full">
      <ChatErrorBoundary
        onError={(error, errorInfo) => console.error('Chat error:', error, errorInfo)}
      >
        <div className="mx-auto w-full max-w-4xl divide-y divide-border/80">
          {safeMessages.map(renderMessage)}
        </div>
        {showTypingIndicator && <TypingIndicator className="message-enter" />}
      </ChatErrorBoundary>
    </ScrollArea>
  );
});
