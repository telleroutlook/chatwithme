import { useEffect, useRef, useState } from 'react';
import { Clock3, Loader2, Plus, Star, Trash2 } from 'lucide-react';
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
  const confirmPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!confirmingDeleteId) return;
      if (!confirmPopoverRef.current) return;
      if (confirmPopoverRef.current.contains(event.target as Node)) return;
      setConfirmingDeleteId(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [confirmingDeleteId]);

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="border-b border-border/80 px-3 py-3 shrink-0">
        <Button onClick={onCreate} className="h-10 w-full justify-start rounded-xl px-3 shadow-sm border-border/60" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {isLoading && conversations.length === 0 ? (
          <ConversationSkeleton />
        ) : (
          <div className="px-2 pb-3 pt-2">
            <div className="mb-2 flex items-center justify-between px-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">History</p>
              <p className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground/80">
                {conversations.length}
              </p>
            </div>

            <ul className="space-y-1">
              {conversations.map((conversation) => (
                <li key={conversation.id} className="px-1">
                  <div
                    className={cn(
                      'relative grid grid-cols-[1fr_40px] items-center rounded-xl border transition-all duration-200',
                      activeId === conversation.id
                        ? 'border-primary/40 bg-primary/10 shadow-sm'
                        : 'border-transparent hover:border-border hover:bg-muted/50'
                    )}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 40px' }}
                  >
                    {/* Left Side: Title and Date - Forced to stay within 1fr */}
                    <div
                      role="button"
                      tabIndex={0}
                      className="min-w-0 cursor-pointer px-3 py-2.5 flex items-start gap-3"
                      style={{ overflow: 'hidden' }}
                      onClick={() => onSelect(conversation.id)}
                    >
                      <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', activeId === conversation.id ? 'bg-primary' : 'bg-muted-foreground/30')} />
                      
                      <div className="min-w-0 flex-1" style={{ maxWidth: '100%' }}>
                        <p className={cn('truncate text-sm leading-5 font-medium', activeId === conversation.id ? 'text-foreground' : 'text-muted-foreground/90')}>
                          {conversation.title || 'New Chat'}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                          <Clock3 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{formatDate(conversation.updatedAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Side: Delete Button - FIXED COLUMN */}
                    <div className="flex items-center justify-center pr-1">
                      <Button
                        variant="secondary"
                        size="icon"
                        className={cn(
                          'h-8 w-8 rounded-lg shadow-sm border border-border/50',
                          'opacity-100 bg-muted/80 hover:bg-destructive/20 hover:text-destructive'
                        )}
                        disabled={deletingId === conversation.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmingDeleteId(conversation.id);
                        }}
                      >
                        {deletingId === conversation.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>

                    {confirmingDeleteId === conversation.id && (
                      <div
                        ref={confirmPopoverRef}
                        className="absolute right-2 top-10 z-[100] w-40 rounded-lg border border-border bg-card p-2 shadow-xl animate-in fade-in"
                        role="dialog"
                      >
                        <p className="px-1 pb-2 text-[11px] font-medium">Delete chat?</p>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="ghost" className="h-7 flex-1 text-[11px]" onClick={() => setConfirmingDeleteId(null)}>No</Button>
                          <Button size="sm" variant="destructive" className="h-7 flex-1 text-[11px]" onClick={() => onDelete(conversation.id)}>Yes</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
