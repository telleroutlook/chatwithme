import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { useAuthStore } from './stores/auth';
import type { UserSafe } from '@chatwithme/shared';

const user: UserSafe = {
  id: 'user-1',
  email: 'tester@example.com',
  username: 'tester',
  avatar: '',
};

describe('ApiClient.stream', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      tokens: null,
      isAuthenticated: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses chunked SSE payload and calls message + done callbacks', async () => {
    useAuthStore.getState().setAuth(user, {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"message","message":"Hel'));
        controller.enqueue(
          encoder.encode('lo"}\n\ndata: {"type":"message","message":" world"}\n\ndata: ')
        );
        controller.enqueue(encoder.encode('{"type":"done"}\n\n'));
        controller.close();
      },
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    );

    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await api.stream('/chat/stream', { message: 'hello' }, onMessage, onDone, onError);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer access-token',
      }),
    });
    expect(onMessage).toHaveBeenNthCalledWith(1, 'Hello');
    expect(onMessage).toHaveBeenNthCalledWith(2, ' world');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('returns error callback on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Bad request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await api.stream('/chat/stream', { message: 'hello' }, onMessage, onDone, onError);

    expect(onMessage).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Bad request');
  });
});
