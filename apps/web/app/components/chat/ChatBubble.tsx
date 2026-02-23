import { cn } from '~/lib/utils';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Bot, User } from 'lucide-react';
import type { Message } from '@chatwithme/shared';

interface ChatBubbleProps {
  message: Message | { role: 'user' | 'assistant'; message: string };
  isStreaming?: boolean;
}

export function ChatBubble({ message, isStreaming }: ChatBubbleProps) {
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
          <MarkdownRenderer content={message.message} />
        )}

        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-foreground/50 animate-pulse ml-1" />
        )}
      </div>
    </div>
  );
}
