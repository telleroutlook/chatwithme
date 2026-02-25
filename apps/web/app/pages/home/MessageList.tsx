import { ScrollArea } from '~/components/ui/scroll-area';
import { ChatBubble } from '~/components/chat/ChatBubble';
import { ChatErrorBoundary } from '~/components/error';
import { EmptyMessages } from '~/components/empty-state';
import { TypingIndicator } from '~/components/chat/TypingIndicator';
import type { Message } from '@chatwithme/shared';
import { useChatScroll } from './hooks/useChatScroll';
import { useChatStore } from '~/stores/chat';

export interface MessageListProps {
  messages: Message[];
  activeConversationId: string | null;
  onRegenerate: () => void;
  onQuickReply: (question: string) => void;
}

export function MessageList({
  messages,
  activeConversationId,
  onRegenerate,
  onQuickReply,
}: MessageListProps) {
  const { messageScrollRef } = useChatScroll({
    activeConversationId,
    currentMessages: messages,
  });

  const { pendingConversationId } = useChatStore();
  const showTypingIndicator = pendingConversationId === activeConversationId;

  // Find the index of the last user message
  const lastUserMessageIndex = [...messages].reverse().findIndex((msg) => msg.role === 'user');
  const actualLastUserMessageIndex = lastUserMessageIndex === -1 ? -1 : messages.length - 1 - lastUserMessageIndex;

  return (
    <ScrollArea ref={messageScrollRef} className="h-full w-full">
      {messages.length === 0 ? (
        <EmptyMessages />
      ) : (
        <ChatErrorBoundary onError={(error, errorInfo) => console.error('Chat error:', error, errorInfo)}>
          <div className="mx-auto w-full max-w-4xl divide-y divide-border/80">
            {messages.map((msg, index) => (
              <ChatBubble
                key={msg.id}
                message={msg}
                messageId={msg.id}
                isLast={index === messages.length - 1}
                isLastUserMessage={index === actualLastUserMessageIndex}
                onRegenerate={onRegenerate}
                onQuickReply={onQuickReply}
              />
            ))}
            {showTypingIndicator && <TypingIndicator className="message-enter" />}
          </div>
        </ChatErrorBoundary>
      )}
    </ScrollArea>
  );
}
