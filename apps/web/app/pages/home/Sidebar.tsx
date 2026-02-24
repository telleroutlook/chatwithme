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
      className={`fixed z-50 h-full w-[90vw] max-w-[85vw] border-r border-border bg-card/95 backdrop-blur-xl lg:relative lg:z-0 lg:max-w-none transition-[transform,width,margin] duration-250 ease-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      } ${
        isCollapsed
          ? 'lg:w-0 lg:min-w-0 lg:border-r-0 lg:overflow-hidden'
          : 'lg:w-72'
      }`}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3 lg:hidden">
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
