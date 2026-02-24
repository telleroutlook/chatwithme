import { ScrollArea } from '~/components/ui/scroll-area';
import { ChatBubble } from '~/components/chat/ChatBubble';
import { ChatErrorBoundary } from '~/components/error';
import { EmptyMessages } from '~/components/empty-state';
import type { Message } from '@chatwithme/shared';
import { useChatScroll } from './hooks/useChatScroll';

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

  return (
    <ScrollArea ref={messageScrollRef} className="flex-1">
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
                onRegenerate={onRegenerate}
                onQuickReply={onQuickReply}
              />
            ))}
          </div>
        </ChatErrorBoundary>
      )}
    </ScrollArea>
  );
}
