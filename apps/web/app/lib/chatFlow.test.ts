import { describe, expect, it, vi } from 'vitest';
import { ensureConversationId } from './chatFlow';
import type { Conversation } from '@chatwithme/shared';

const makeConversation = (id: string): Conversation => ({
  id,
  userId: 'user-1',
  title: 'New Chat',
  starred: false,
  createdAt: new Date('2026-02-24T00:00:00.000Z'),
  updatedAt: new Date('2026-02-24T00:00:00.000Z'),
});

describe('ensureConversationId', () => {
  it('returns active conversation id directly when it exists', async () => {
    const createConversation = vi.fn();
    const onConversationCreated = vi.fn();

    const conversationId = await ensureConversationId({
      activeConversationId: 'conv-active',
      createConversation,
      onConversationCreated,
    });

    expect(conversationId).toBe('conv-active');
    expect(createConversation).not.toHaveBeenCalled();
    expect(onConversationCreated).not.toHaveBeenCalled();
  });

  it('creates conversation and reports it when active conversation is missing', async () => {
    const createdConversation = makeConversation('conv-created');
    const createConversation = vi.fn().mockResolvedValue(createdConversation);
    const onConversationCreated = vi.fn();

    const conversationId = await ensureConversationId({
      activeConversationId: null,
      createConversation,
      onConversationCreated,
    });

    expect(conversationId).toBe('conv-created');
    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(onConversationCreated).toHaveBeenCalledWith(createdConversation);
  });
});
