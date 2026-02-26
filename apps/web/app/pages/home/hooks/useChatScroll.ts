import { useRef, useEffect } from 'react';
import type { Message } from '@chatwithme/shared';

export interface UseChatScrollOptions {
  activeConversationId: string | null;
  currentMessages: Message[];
}

export interface UseChatScrollReturn {
  messageScrollRef: React.RefObject<HTMLDivElement | null>;
  restoreScrollConversationIdRef: React.MutableRefObject<string | null>;
}

export function useChatScroll({
  activeConversationId,
  currentMessages,
}: UseChatScrollOptions): UseChatScrollReturn {
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const restoreScrollConversationIdRef = useRef<string | null>(null);
  const skipNextAutoScrollRef = useRef(false);

  // Restore scroll position when switching conversations
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
      if (!viewport) return;

      const lastUserMessage = [...currentMessages]
        .reverse()
        .find((message) => message.role === 'user');
      const targetMessage = lastUserMessage ?? currentMessages[0];
      const targetElement = viewport.querySelector<HTMLElement>(
        `[data-message-id="${targetMessage.id}"]`
      );

      if (targetElement) {
        skipNextAutoScrollRef.current = true;
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);

    restoreScrollConversationIdRef.current = null;
    return () => clearTimeout(timer);
  }, [activeConversationId, currentMessages]);

  // Auto scroll to bottom when new messages arrive
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

  return {
    messageScrollRef,
    restoreScrollConversationIdRef,
  };
}
