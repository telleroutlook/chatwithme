import { api } from '~/client';
import { queryKeys } from '~/lib/queryKeys';
import type { Message } from '@chatwithme/shared';
import { sanitizeMessages } from '~/lib/messageSanitizer';
import { useQuery } from '@tanstack/react-query';

export function useMessages(conversationId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.messages(conversationId!),
    queryFn: async () => {
      const response = await api.get<{ messages: Message[] }>(
        `/chat/conversations/${conversationId}/messages`
      );
      if (!response.success || !response.data) throw new Error('Failed to load messages');
      return sanitizeMessages(response.data.messages);
    },
    enabled: enabled && !!conversationId,
  });
}
