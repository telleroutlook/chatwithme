import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore } from './chat';
import type { Conversation, Message } from '@chatwithme/shared';

const baseTime = new Date('2026-02-24T00:00:00.000Z');

const makeConversation = (id: string): Conversation => ({
  id,
  userId: 'user-1',
  title: `Conversation ${id}`,
  starred: false,
  createdAt: baseTime,
  updatedAt: baseTime,
});

const makeMessage = (conversationId: string, id: string): Message => ({
  id,
  userId: 'user-1',
  conversationId,
  role: 'user',
  message: `message-${id}`,
  files: [],
  generatedImageUrls: [],
  searchResults: [],
  createdAt: baseTime,
});

describe('useChatStore.removeConversation', () => {
  beforeEach(() => {
    useChatStore.setState({
      conversations: [makeConversation('conv-1'), makeConversation('conv-2')],
      activeConversationId: 'conv-1',
      messages: {
        'conv-1': [makeMessage('conv-1', 'msg-1')],
        'conv-2': [makeMessage('conv-2', 'msg-2')],
      },
      isLoading: false,
      isStreaming: false,
      streamingMessage: '',
    });
  });

  it('removes conversation messages and switches active conversation', () => {
    useChatStore.getState().removeConversation('conv-1');

    const nextState = useChatStore.getState();
    expect(nextState.conversations.map((conversation) => conversation.id)).toEqual(['conv-2']);
    expect(nextState.activeConversationId).toBe('conv-2');
    expect(nextState.messages['conv-1']).toBeUndefined();
    expect(nextState.messages['conv-2']).toHaveLength(1);
  });
});
