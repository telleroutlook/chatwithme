import { MessageSkeleton } from './MessageSkeleton';

export function ChatSkeleton() {
  return (
    <div className="flex flex-col">
      <MessageSkeleton role="user" />
      <MessageSkeleton role="assistant" />
      <MessageSkeleton role="user" />
      <MessageSkeleton role="assistant" />
    </div>
  );
}
