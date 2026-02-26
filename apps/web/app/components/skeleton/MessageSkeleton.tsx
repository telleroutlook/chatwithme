import { cn } from '~/lib/utils';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';

interface MessageSkeletonProps {
  role?: 'user' | 'assistant';
}

export function MessageSkeleton({ role = 'assistant' }: MessageSkeletonProps) {
  const isUser = role === 'user';

  return (
    <div className={cn('flex gap-2 p-3 sm:gap-3 sm:p-4', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <Avatar className="h-8 w-8 shrink-0 sm:h-9 sm:w-9">
        <AvatarFallback className={cn('animate-pulse', isUser ? 'bg-muted' : 'bg-muted')} />
      </Avatar>

      <div
        className={cn(
          'flex-1 max-w-[88%] rounded-xl px-3.5 py-3 sm:max-w-[82%] sm:px-4',
          isUser ? 'bg-muted' : 'bg-card border border-border'
        )}
      >
        <div className="space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>

        <div className="mt-3 flex items-center gap-1">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}
