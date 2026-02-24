import { cn } from '~/lib/utils';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Bot, User, Copy, Check, RefreshCw } from 'lucide-react';
import { useState, memo, lazy, Suspense } from 'react';
import type { Message } from '@chatwithme/shared';

const MarkdownRenderer = lazy(async () => {
  const mod = await import('./MarkdownRenderer');
  return { default: mod.MarkdownRenderer };
});

interface ChatBubbleProps {
  message: Message | { role: 'user' | 'assistant'; message: string };
  isStreaming?: boolean;
  isLast?: boolean;
  onRegenerate?: () => void;
}

export const ChatBubble = memo<ChatBubbleProps>(
  ({ message, isStreaming, isLast, onRegenerate }) => {
    const isUser = message.role === 'user';

    return (
      <div
        className={cn(
          'flex gap-3 p-4',
          isUser ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        <Avatar className="h-8 w-8 shrink-0">
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
            'flex-1 max-w-[80%] rounded-lg px-4 py-3',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-card border border-border'
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.message}</p>
          ) : (
            <Suspense fallback={<p className="whitespace-pre-wrap break-words">{message.message}</p>}>
              <MarkdownRenderer content={message.message} />
            </Suspense>
          )}

          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-foreground/50 animate-pulse ml-1" />
          )}

          {/* AI message action buttons - always visible */}
          {!isUser && !isStreaming && (
            <div className="mt-3 flex items-center gap-1">
              <CopyMessageButton text={message.message} />
              {isLast && onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                  title="Regenerate response"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);
ChatBubble.displayName = 'ChatBubble';

interface CopyMessageButtonProps {
  text: string;
}

const CopyMessageButton = memo<CopyMessageButtonProps>(({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
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
