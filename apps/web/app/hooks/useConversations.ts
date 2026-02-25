import { useQuery } from '@tanstack/react-query';
import { api } from '~/client';
import { queryKeys } from '~/lib/queryKeys';
import type { Conversation } from '@chatwithme/shared';

export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: async () => {
      const response = await api.get<{ conversations: Conversation[] }>('/chat/conversations');
      if (!response.success || !response.data) throw new Error('Failed to load conversations');
      return response.data.conversations;
    },
  });
}
