import { FilePlus, MessageSquarePlus, Sparkles } from 'lucide-react';

interface EmptyConversationsProps {
  onCreateNew?: () => void;
  className?: string;
}

/**
 * EmptyConversations component - displayed when there are no conversations.
 * Shows a prompt to create a new conversation.
 */
export function EmptyConversations({ onCreateNew, className = '' }: EmptyConversationsProps) {
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center px-6 py-12 text-muted-foreground fade-in ${className}`}
    >
      {/* Icon container */}
      <div className="relative mb-5">
        <div className="absolute inset-0 bg-gradient-to-br from-muted-foreground/10 to-transparent rounded-full blur-2xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border/50">
          <MessageSquarePlus className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
        </div>
      </div>

      {/* Empty state message */}
      <h3 className="mb-2 text-center text-lg font-semibold text-foreground">
        No conversations yet
      </h3>
      <p className="max-w-xs text-center text-sm leading-relaxed">
        Create your first conversation to start chatting with the assistant.
      </p>

      {/* Action button */}
      {onCreateNew && (
        <button
          onClick={onCreateNew}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-smooth hover:bg-primary/90 active:scale-95"
        >
          <FilePlus className="h-4 w-4" />
          New Conversation
        </button>
      )}

      {/* Decorative hint */}
      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground/70">
        <Sparkles className="h-3 w-3" />
        <span>Your conversations will appear here</span>
      </div>
    </div>
  );
}
