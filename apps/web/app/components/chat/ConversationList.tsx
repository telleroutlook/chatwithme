import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Clock3, Loader2, MessageSquare, Plus, Star, Trash2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { ScrollArea } from '~/components/ui/scroll-area';
import { ConversationSkeleton } from '~/components/skeleton';
import { cn } from '~/lib/utils';
import type { Conversation } from '@chatwithme/shared';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  deletingId?: string | null;
  isLoading?: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function ConversationList({
  conversations,
  activeId,
  deletingId = null,
  isLoading = false,
  onSelect,
  onCreate,
  onDelete,
}: ConversationListProps) {
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [confirmPopoverNudgeLeft, setConfirmPopoverNudgeLeft] = useState(0);
  const confirmPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!confirmingDeleteId) return;
      if (!confirmPopoverRef.current) return;
      if (confirmPopoverRef.current.contains(event.target as Node)) return;
      setConfirmingDeleteId(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConfirmingDeleteId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [confirmingDeleteId]);

  useEffect(() => {
    if (!deletingId) return;
    setConfirmingDeleteId(null);
  }, [deletingId]);

  useLayoutEffect(() => {
    if (!confirmingDeleteId) return;

    const reposition = () => {
      const popover = confirmPopoverRef.current;
      if (!popover) return;

      const viewportPadding = 8;
      const rect = popover.getBoundingClientRect();
      const rightOverflow = rect.right - (window.innerWidth - viewportPadding);

      if (rightOverflow <= 0) {
        setConfirmPopoverNudgeLeft(0);
        return;
      }

      // Shift left but keep a minimum left safe area in narrow viewports.
      const maxNudgeLeft = Math.max(0, rect.left - viewportPadding);
      const nextNudgeLeft = Math.min(rightOverflow, maxNudgeLeft);
      setConfirmPopoverNudgeLeft(nextNudgeLeft);
    };

    const rafId = window.requestAnimationFrame(reposition);
    window.addEventListener('resize', reposition);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', reposition);
    };
  }, [confirmingDeleteId]);

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/80 px-3 py-3">
        <Button
          onClick={onCreate}
          className="h-10 w-full justify-start rounded-xl border-border/80 bg-background/70 px-3 shadow-sm"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {isLoading && conversations.length === 0 ? (
          <ConversationSkeleton />
        ) : (
          <div className="px-2 pb-3 pt-2">
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">
                History
              </p>
              <p className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {conversations.length}
              </p>
            </div>

            <ul className="space-y-1">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <div
                    className={cn(
                      'group relative overflow-hidden rounded-xl border transition-all duration-200',
                      activeId === conversation.id
                        ? 'border-primary/35 bg-primary/8 shadow-[0_6px_16px_-10px_oklch(from_var(--primary)_l_c_h_/_0.55)]'
                        : 'border-transparent hover:border-border hover:bg-muted/55'
                    )}
                  >
                    <button
                      type="button"
                      className="w-full cursor-pointer px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      onClick={() => onSelect(conversation.id)}
                    >
                      <div className="flex min-w-0 items-start gap-2 pr-9">
                        <span
                          className={cn(
                            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                            activeId === conversation.id ? 'bg-primary' : 'bg-muted-foreground/40'
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'truncate text-sm leading-5',
                              activeId === conversation.id
                                ? 'font-semibold text-foreground'
                                : 'font-medium'
                            )}
                          >
                            {conversation.title || 'New Chat'}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock3 className="h-3 w-3" />
                            <span>{formatDate(conversation.updatedAt)}</span>
                            {conversation.starred && (
                              <Star className="ml-1 h-3 w-3 fill-yellow-500 text-yellow-500" />
                            )}
                          </div>
                        </div>
                      </div>
                    </button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1.5 top-1.5 h-7 w-7 rounded-md text-muted-foreground/85 opacity-100 transition-all hover:bg-destructive hover:text-destructive-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      disabled={deletingId === conversation.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmPopoverNudgeLeft(0);
                        setConfirmingDeleteId((current) =>
                          current === conversation.id ? null : conversation.id
                        );
                      }}
                      title="Delete conversation"
                      aria-label={`Delete ${conversation.title || 'conversation'}`}
                    >
                      {deletingId === conversation.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>

                    {confirmingDeleteId === conversation.id && (
                      <div
                        ref={confirmPopoverRef}
                        className="absolute right-1.5 top-9 z-20 w-52 rounded-lg border border-border bg-card/95 p-2 shadow-lg backdrop-blur-sm"
                        style={{
                          animation: 'fade-in 120ms var(--easing-out)',
                          transform: `translateX(-${confirmPopoverNudgeLeft}px)`,
                        }}
                        role="dialog"
                        aria-label="Confirm conversation deletion"
                      >
                        <div className="absolute -top-1.5 right-3 h-3 w-3 rotate-45 border-l border-t border-border bg-card/95" />
                        <p className="px-1 pb-2 text-xs text-muted-foreground">
                          Delete this conversation?
                        </p>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 flex-1 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmingDeleteId(null);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 flex-1 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(conversation.id);
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {conversations.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/80 bg-muted/25 py-10 text-center text-muted-foreground">
                <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm">No conversations yet</p>
                <p className="text-xs">Start a new chat to begin</p>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
