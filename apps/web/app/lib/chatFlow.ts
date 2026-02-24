import type { Conversation } from '@chatwithme/shared';

interface EnsureConversationParams {
  activeConversationId: string | null;
  createConversation: () => Promise<Conversation | null>;
  onConversationCreated: (conversation: Conversation) => void;
}

export async function ensureConversationId({
  activeConversationId,
  createConversation,
  onConversationCreated,
}: EnsureConversationParams): Promise<string | null> {
  if (activeConversationId) {
    return activeConversationId;
  }

  const conversation = await createConversation();
  if (!conversation) {
    return null;
  }

  onConversationCreated(conversation);
  return conversation.id;
}
