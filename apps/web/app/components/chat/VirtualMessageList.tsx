import { useCallback, useRef } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { Message } from '@chatwithme/shared';

export interface VirtualMessageListProps {
  messages: Message[];
  renderMessage: (message: Message, index: number) => React.ReactNode;
  onScrollToBottom?: () => void;
  isAtBottom?: boolean;
  virtuosoRef?: React.RefObject<VirtuosoHandle | null>;
  initialScrollTop?: number;
}

export function VirtualMessageList({
  messages,
  renderMessage,
  onScrollToBottom,
  isAtBottom = true,
  virtuosoRef,
  initialScrollTop,
}: VirtualMessageListProps) {
  const internalRef = useRef<VirtuosoHandle>(null);
  const virtuosoInstanceRef = (virtuosoRef as React.RefObject<VirtuosoHandle>) || internalRef;

  const handleScrollToBottom = useCallback(() => {
    virtuosoInstanceRef.current?.scrollToIndex({
      index: messages.length - 1,
      behavior: 'smooth',
    });
  }, [messages.length, virtuosoInstanceRef]);

  const handleIsAtBottom = useCallback((isAtBottom: boolean) => {
    if (isAtBottom && onScrollToBottom) {
      onScrollToBottom();
    }
  }, [onScrollToBottom]);

  return (
    <Virtuoso
      ref={virtuosoInstanceRef}
      data={messages}
      itemContent={(index, message) => renderMessage(message, index)}
      initialTopMostItemIndex={initialScrollTop !== undefined ? Math.floor(initialScrollTop / 50) : undefined}
      atBottomStateChange={handleIsAtBottom}
      atBottomThreshold={100}
      className="h-full w-full"
      style={{ contain: 'strict' }}
      components={{
        List: ({ children, ...props }) => (
          <div
            {...props}
            className="mx-auto w-full max-w-4xl divide-y divide-border/80"
            role="log"
            aria-live="polite"
            aria-label="Chat messages"
          >
            {children}
          </div>
        ),
      }}
    />
  );
}
