import { cn } from '~/lib/utils';
import { Bot } from 'lucide-react';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { memo } from 'react';

interface TypingIndicatorProps {
  className?: string;
}

export const TypingIndicator = memo<TypingIndicatorProps>(({ className }) => {
  return (
    <div
      className={cn('flex gap-2 p-3 sm:gap-3 sm:p-4', className)}
      role="status"
      aria-live="polite"
      aria-label="Assistant is typing"
    >
      <Avatar className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" aria-hidden="true">
        <AvatarFallback className="bg-muted">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 max-w-[88%] rounded-xl bg-card border border-border px-4 py-3 sm:max-w-[82%] sm:px-4">
        <div className="flex items-center gap-2 h-8" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="typing-dot h-3 w-3 rounded-full bg-muted-foreground/60"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

TypingIndicator.displayName = 'TypingIndicator';
