export const queryKeys = {
  conversations: ['conversations'] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
  conversation: (id: string) => ['conversation', id] as const,
} as const;
