import React, { useEffect, useRef, useState, useCallback } from 'react';
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
}

// Sub-component for individual conversation items to optimize performance
const ConversationItem = React.memo(({ 
  conversation, 
  isActive, 
  isDeleting, 
  onSelect, 
  onDelete 
}: { 
  conversation: Conversation; 
  isActive: boolean; 
  isDeleting: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!showConfirm) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowConfirm(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showConfirm]);

  return (
    <div
      className={cn(
        'group relative grid grid-cols-[1fr_auto] items-center rounded-xl border transition-all duration-200',
        isActive 
          ? 'border-primary/30 bg-primary/5 shadow-sm' 
          : 'border-transparent hover:border-border hover:bg-muted/40'
      )}
    >
      <div
        role="button"
        tabIndex={0}
        className="min-w-0 cursor-pointer px-3 py-2.5 flex items-start gap-3"
        onClick={() => onSelect(conversation.id)}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(conversation.id)}
      >
        <span className={cn(
          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', 
          isActive ? 'bg-primary' : 'bg-muted-foreground/30'
        )} />
        
        <div className="min-w-0 flex-1">
          <p className={cn(
            'truncate text-sm leading-5 font-medium',
            isActive ? 'text-foreground' : 'text-muted-foreground/90'
          )}>
            {conversation.title || 'New Chat'}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
            <Clock3 className="h-3 w-3 shrink-0" />
            <span className="truncate">{formatDate(conversation.updatedAt)}</span>
            {conversation.starred && <Star className="ml-1 h-3 w-3 shrink-0 fill-yellow-500 text-yellow-500" />}
          </div>
        </div>
      </div>

      <div className="flex items-center pr-1.5">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 rounded-lg transition-all duration-200',
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            'hover:bg-destructive/10 hover:text-destructive'
          )}
          disabled={isDeleting}
          onClick={(e) => {
            e.stopPropagation();
            setShowConfirm(true);
          }}
        >
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>

      {showConfirm && (
        <div
          ref={popoverRef}
          className="absolute right-2 top-10 z-50 w-44 rounded-lg border border-border bg-card p-2 shadow-xl animate-in fade-in slide-in-from-top-1"
        >
          <p className="px-1 pb-2 text-[11px] font-medium text-muted-foreground">Delete conversation?</p>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" className="h-7 flex-1 text-[11px]" onClick={() => setShowConfirm(false)}>No</Button>
            <Button 
              size="sm" 
              variant="destructive" 
              className="h-7 flex-1 text-[11px]" 
              onClick={() => {
                onDelete(conversation.id);
                setShowConfirm(false);
              }}
            >
              Yes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

ConversationItem.displayName = 'ConversationItem';

export function ConversationList({
  conversations,
  activeId,
  deletingId = null,
  isLoading = false,
  onSelect,
  onCreate,
  onDelete,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 px-3 py-3 shrink-0">
        <Button 
          onClick={onCreate} 
          className="h-10 w-full justify-start rounded-xl px-3 shadow-none border-dashed bg-transparent hover:bg-muted/50" 
          variant="outline"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {isLoading && conversations.length === 0 ? (
          <ConversationSkeleton />
        ) : (
          <div className="px-2 pb-4 pt-2">
            <header className="mb-2 flex items-center justify-between px-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">History</span>
              <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground/70">
                {conversations.length}
              </span>
            </header>

            <div className="space-y-1">
              {conversations.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={activeId === conversation.id}
                  isDeleting={deletingId === conversation.id}
                  onSelect={onSelect}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
