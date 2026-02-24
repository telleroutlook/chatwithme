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

  it('parses suggestions event and calls suggestions callback', async () => {
    useAuthStore.getState().setAuth(user, {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            'data: {"type":"suggestions","suggestions":["Q1","Q2","Q3"]}\n\ndata: {"type":"done"}\n\n'
          )
        );
        controller.close();
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    );

    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    const onSuggestions = vi.fn();

    await api.stream('/chat/stream', { message: 'hello' }, onMessage, onDone, onError, onSuggestions);

    expect(onMessage).not.toHaveBeenCalled();
    expect(onSuggestions).toHaveBeenCalledWith(['Q1', 'Q2', 'Q3']);
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

  it('refreshes token and retries stream when first request returns 401', async () => {
    useAuthStore.getState().setAuth(user, {
      accessToken: 'expired-access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"message","message":"ok"}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
        controller.close();
      },
    });

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { accessToken: 'new-access-token', expiresIn: 900 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );

    const onMessage = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await api.stream('/chat/stream', { message: 'hello' }, onMessage, onDone, onError);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('/chat/stream');
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('/auth/refresh');
    expect(fetchSpy.mock.calls[2]?.[0]).toBe('/chat/stream');
    expect(fetchSpy.mock.calls[2]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: 'Bearer new-access-token',
      }),
    });
    expect(onMessage).toHaveBeenCalledWith('ok');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
