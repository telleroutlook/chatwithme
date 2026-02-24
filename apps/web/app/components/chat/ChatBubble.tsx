import { cn } from '~/lib/utils';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Bot, User, Copy, Check, RefreshCw } from 'lucide-react';
import { useState, memo, Suspense, lazy, useEffect } from 'react';
import { ErrorBoundary } from '~/components/error';
import type { Message } from '@chatwithme/shared';

const LazyMarkdownRenderer = lazy(() => import('./MarkdownRenderer').then(m => ({ default: m.MarkdownRenderer })));

interface ChatBubbleProps {
  message: Message | { role: 'user' | 'assistant'; message: string };
  messageId?: string;
  isLast?: boolean;
  onRegenerate?: () => void;
  onQuickReply?: (question: string) => void;
}

export const ChatBubble = memo<ChatBubbleProps>(
  ({ message, messageId, isLast, onRegenerate, onQuickReply }) => {
    const isUser = message.role === 'user';
    const suggestions = 'suggestions' in message ? message.suggestions : undefined;
    const [animateEntry, setAnimateEntry] = useState(true);

    useEffect(() => {
      setAnimateEntry(false);
    }, []);

    return (
      <div
        data-message-id={messageId}
        className={cn(
          'flex gap-2 p-3 sm:gap-3 sm:p-4',
          isUser ? 'flex-row-reverse' : 'flex-row',
          animateEntry ? 'message-enter' : ''
        )}
      >
        <Avatar className="h-8 w-8 shrink-0 sm:h-9 sm:w-9">
          <AvatarFallback
            className={cn(
              isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
            )}
          >
            {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>

        <div
          className={cn(
            'flex-1 max-w-[88%] rounded-xl px-3.5 py-3 text-[15px] leading-relaxed sm:max-w-[82%] sm:px-4',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-card border border-border'
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.message}</p>
          ) : (
            <ErrorBoundary fallback={({ error }) => (
              <div className="text-destructive text-sm">Failed to render message</div>
            )}>
              <Suspense fallback={<div className="animate-pulse bg-muted rounded-lg h-20" />}>
                <LazyMarkdownRenderer content={message.message} />
              </Suspense>
            </ErrorBoundary>
          )}

          {!isUser && suggestions && suggestions.length > 0 && onQuickReply && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion}-${index}`}
                  onClick={() => onQuickReply(suggestion)}
                  className="rounded-full border border-border bg-muted/40 px-3 py-2.5 text-xs text-foreground transition-colors hover:bg-muted active:bg-muted/80"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-1">
              <CopyMessageButton text={message.message} isUser={isUser} />
              {!isUser && isLast && onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="h-10 w-10 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted/80 active:text-foreground"
                  title="Regenerate response"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
            </div>
        </div>
      </div>
    );
  }
);
ChatBubble.displayName = 'ChatBubble';

interface CopyMessageButtonProps {
  text: string;
  isUser?: boolean;
}

const CopyMessageButton = memo<CopyMessageButtonProps>(({ text, isUser = false }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'h-10 w-10 rounded-lg p-2 transition-colors',
        isUser
          ? 'text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground active:bg-primary-foreground/20'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80'
      )}
      title="Copy text"
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
});
CopyMessageButton.displayName = 'CopyMessageButton';
