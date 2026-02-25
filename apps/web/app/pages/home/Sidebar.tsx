import { X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { ConversationList } from '~/components/chat/ConversationList';
import type { Conversation } from '@chatwithme/shared';

export interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  conversations: Conversation[];
  activeId: string | null;
  deletingId: string | null;
  isLoading?: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

// Simplified Sidebar - Content provider, layout handled by Home
export function Sidebar({
  isOpen,
  isCollapsed,
  conversations,
  activeId,
  deletingId,
  isLoading = false,
  onClose,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: SidebarProps) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[300px] border-r border-border bg-card transition-transform duration-300 ease-in-out lg:static lg:z-0 lg:w-full lg:max-w-none lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } flex flex-col h-full overflow-hidden`}
    >
      {/* Mobile-only header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 lg:hidden">
        <h1 className="text-base font-semibold">ChatWithMe</h1>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <ConversationList
        conversations={conversations}
        activeId={activeId}
        deletingId={deletingId}
        isLoading={isLoading}
        onSelect={onSelect}
        onCreate={onCreate}
        onDelete={onDelete}
        onRename={onRename}
      />
    </aside>
  );
}
