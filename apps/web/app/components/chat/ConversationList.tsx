import { Loader2, Plus, MessageSquare, Star, Trash2 } from 'lucide-react';
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
  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <Button onClick={onCreate} className="h-11 w-full rounded-xl" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {isLoading && conversations.length === 0 ? (
          <ConversationSkeleton />
        ) : (
          <div className="space-y-1 p-2">
            {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={cn(
                'group flex cursor-pointer items-center justify-between gap-1 rounded-xl px-3 py-2.5 transition-colors overflow-hidden',
                activeId === conversation.id
                  ? 'bg-primary/20 text-primary'
                  : 'hover:bg-muted'
              )}
              onClick={() => onSelect(conversation.id)}
            >
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                <MessageSquare className="h-4 w-4 shrink-0" />

                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate text-sm font-medium">
                    {conversation.title || 'New Chat'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(conversation.updatedAt)}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {conversation.starred && (
                  <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-lg text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground active:opacity-100 active:bg-destructive/90 transition-opacity"
                  disabled={deletingId === conversation.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    const confirmed = window.confirm('Delete this conversation?');
                    if (confirmed) {
                      onDelete(conversation.id);
                    }
                  }}
                  title="Delete conversation"
                  aria-label="Delete conversation"
                >
                  {deletingId === conversation.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}

            {conversations.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
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
