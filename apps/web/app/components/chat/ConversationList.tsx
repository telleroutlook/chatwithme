import { Plus, MessageSquare, Star, Trash2, MoreHorizontal } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { ScrollArea } from '~/components/ui/scroll-area';
import { cn } from '~/lib/utils';
import type { Conversation } from '@chatwithme/shared';
import { useState } from 'react';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: ConversationListProps) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

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
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <Button onClick={onCreate} className="w-full" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={cn(
                'group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors',
                activeId === conversation.id
                  ? 'bg-primary/20 text-primary'
                  : 'hover:bg-muted'
              )}
              onClick={() => onSelect(conversation.id)}
            >
              <MessageSquare className="h-4 w-4 shrink-0" />

              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">
                  {conversation.title || 'New Chat'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(conversation.updatedAt)}
                </p>
              </div>

              {conversation.starred && (
                <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
              )}

              <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === conversation.id ? null : conversation.id);
                  }}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>

                {menuOpen === conversation.id && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setMenuOpen(null)}
                    />
                    <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[120px]">
                      <button
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(conversation.id);
                          setMenuOpen(null);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </>
                )}
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
      </ScrollArea>
    </div>
  );
}
