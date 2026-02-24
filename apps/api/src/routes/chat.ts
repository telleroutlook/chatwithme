import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppBindings } from '../store-context';
import { createDb } from '../db';
import { authMiddleware, getAuthInfo } from '../middleware/auth';
import {
  createConversation,
  getConversationById,
  getConversationsByUserId,
  updateConversation,
  deleteConversation,
} from '../dao/conversations';
import { createMessage, getRecentMessages } from '../dao/messages';
import { generateId } from '../utils/crypto';
import { ERROR_CODES } from '../constants/error-codes';
import { errorResponse, validationErrorHook } from '../utils/response';
import { generateFollowUpSuggestions } from '../utils/suggestions';
import OpenAI from 'openai';
import type { ThinkMode } from '@chatwithme/shared';

const chat = new Hono<AppBindings>();

const conversationIdParamSchema = z.object({
  id: z.string().min(1),
});

const updateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    starred: z.boolean().optional(),
  })
  .refine((payload) => payload.title !== undefined || payload.starred !== undefined, {
    message: 'At least one field is required',
  });

const streamRequestSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().trim().min(1),
  files: z
    .array(
      z.object({
        url: z.string().url(),
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
        size: z.number().int().nonnegative(),
      })
    )
    .optional(),
  model: z.string().min(1).optional(),
  thinkMode: z.enum(['instant', 'think', 'deepthink']).optional(),
});

const THINKING_EFFORT_BY_MODE: Record<ThinkMode, OpenAI.Chat.ChatCompletionReasoningEffort> = {
  instant: 'low',
  think: 'medium',
  deepthink: 'high',
};
const EFFORT_PLAN_BY_MODE: Record<ThinkMode, OpenAI.Chat.ChatCompletionReasoningEffort[]> = {
  instant: ['low'],
  think: ['medium', 'low'],
  deepthink: ['high', 'medium', 'low'],
};
const MODEL_CALL_TIMEOUT_MS = 90000;
const RESPONSE_MAX_TOKENS = 600;

async function withModelTimeout<T>(task: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return (await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Model request timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ])) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type ModelErrorDetail = {
  name: string;
  message: string;
  status?: number;
  code?: string;
  type?: string;
  param?: string;
  requestId?: string;
  body?: unknown;
  cause?: unknown;
};

function toModelErrorDetail(error: unknown): ModelErrorDetail {
  if (error instanceof Error) {
    const ext = error as Error & Record<string, unknown>;
    const responseObj =
      typeof ext.response === 'object' && ext.response !== null
        ? (ext.response as Record<string, unknown>)
        : undefined;

    return {
      name: error.name,
      message: error.message,
      status: typeof ext.status === 'number' ? ext.status : undefined,
      code: typeof ext.code === 'string' ? ext.code : undefined,
      type: typeof ext.type === 'string' ? ext.type : undefined,
      param: typeof ext.param === 'string' ? ext.param : undefined,
      requestId:
        typeof ext.request_id === 'string'
          ? ext.request_id
          : typeof ext.requestId === 'string'
            ? ext.requestId
            : undefined,
      body: ext.error ?? ext.body ?? responseObj?.body,
      cause:
        ext.cause instanceof Error
          ? { name: ext.cause.name, message: ext.cause.message }
          : ext.cause,
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}

function truncateText(value: string, max = 500): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function extractTextFromUnknown(value: unknown, depth = 0): string {
  if (depth > 5 || value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item) => extractTextFromUnknown(item, depth + 1)).join('');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const priorityKeys = ['text', 'content', 'reasoning_content', 'message', 'output_text', 'delta', 'result'];
    let merged = '';
    for (const key of priorityKeys) {
      if (key in obj) {
        merged += extractTextFromUnknown(obj[key], depth + 1);
      }
    }
    return merged;
  }
  return '';
}

function parseCompletionText(completion: unknown): string {
  const payload = completion as Record<string, unknown>;
  const candidates: unknown[] = [
    (payload.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message,
    (payload.choices as Array<Record<string, unknown>> | undefined)?.[0]?.text,
    payload.output_text,
    payload.output,
    payload.message,
    payload.result,
    (payload.data as Record<string, unknown> | undefined)?.choices,
  ];

  for (const candidate of candidates) {
    const text = extractTextFromUnknown(candidate).trim();
    if (text) return text;
  }

  return '';
}

function summarizeCompletionPayload(completion: unknown): Record<string, unknown> {
  const payload = completion as Record<string, unknown>;
  const choices = payload.choices as Array<Record<string, unknown>> | undefined;
  const choice0 = choices?.[0];
  const message0 = choice0?.message as Record<string, unknown> | undefined;

  return {
    id: payload.id,
    model: payload.model,
    choicesCount: choices?.length ?? 0,
    choice0Keys: choice0 ? Object.keys(choice0) : [],
    choice0MessageKeys: message0 ? Object.keys(message0) : [],
    choice0MessageContentPreview: truncateText(extractTextFromUnknown(message0?.content), 200),
    choice0ReasoningContentPreview: truncateText(extractTextFromUnknown(message0?.reasoning_content), 200),
    choice0TextPreview: truncateText(extractTextFromUnknown(choice0?.text), 200),
    outputTextPreview: truncateText(extractTextFromUnknown(payload.output_text), 200),
    outputPreview: truncateText(extractTextFromUnknown(payload.output), 200),
  };
}

chat.use('/*', authMiddleware);

chat.get('/conversations', async (c) => {
  const { userId } = getAuthInfo(c);
  const db = createDb(c.env.DB);
  const conversations = await getConversationsByUserId(db, userId);
  return c.json({ success: true, data: { conversations } });
});

chat.post('/conversations', async (c) => {
  const { userId } = getAuthInfo(c);
  const db = createDb(c.env.DB);
  const now = new Date();

  const conversation = await createConversation(db, {
    id: generateId(),
    userId,
    title: '',
    starred: false,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ success: true, data: { conversation } });
});

chat.get('/conversations/:id', zValidator('param', conversationIdParamSchema, validationErrorHook), async (c) => {
  const { userId } = getAuthInfo(c);
  const { id } = c.req.valid('param');
  const db = createDb(c.env.DB);

  const conversation = await getConversationById(db, id);
  if (!conversation) {
    return errorResponse(c, 404, ERROR_CODES.CONVERSATION_NOT_FOUND, 'Conversation not found');
  }

  if (conversation.userId !== userId) {
    return errorResponse(c, 403, ERROR_CODES.FORBIDDEN, 'Unauthorized');
  }

  const messages = await getRecentMessages(db, id, 100);
  return c.json({ success: true, data: { conversation, messages } });
});

chat.patch(
  '/conversations/:id',
  zValidator('param', conversationIdParamSchema, validationErrorHook),
  zValidator('json', updateConversationSchema, validationErrorHook),
  async (c) => {
    const { userId } = getAuthInfo(c);
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const db = createDb(c.env.DB);

    const conversation = await getConversationById(db, id);
    if (!conversation) {
      return errorResponse(c, 404, ERROR_CODES.CONVERSATION_NOT_FOUND, 'Conversation not found');
    }

    if (conversation.userId !== userId) {
      return errorResponse(c, 403, ERROR_CODES.FORBIDDEN, 'Unauthorized');
    }

    const updated = await updateConversation(db, id, {
      ...body,
      updatedAt: new Date(),
    });

    return c.json({ success: true, data: { conversation: updated } });
  }
);

chat.delete('/conversations/:id', zValidator('param', conversationIdParamSchema, validationErrorHook), async (c) => {
  const { userId } = getAuthInfo(c);
  const { id } = c.req.valid('param');
  const db = createDb(c.env.DB);

  const conversation = await getConversationById(db, id);
  if (!conversation) {
    return errorResponse(c, 404, ERROR_CODES.CONVERSATION_NOT_FOUND, 'Conversation not found');
  }

  if (conversation.userId !== userId) {
    return errorResponse(c, 403, ERROR_CODES.FORBIDDEN, 'Unauthorized');
  }

  await deleteConversation(db, id);
  return c.json({ success: true, data: { message: 'Conversation deleted' } });
});

chat.post('/stream', zValidator('json', streamRequestSchema, validationErrorHook), async (c) => {
  const traceId = generateId();
  const requestStartedAt = Date.now();
  c.header('X-Trace-Id', traceId);

  const { userId } = getAuthInfo(c);
  const {
    conversationId,
    message,
    files,
    model: requestedModel,
    thinkMode = 'think',
  } = c.req.valid('json');
  const model = requestedModel || c.env.OPENROUTER_CHAT_MODEL || 'gpt-5.3-codex';
  const db = createDb(c.env.DB);

  const conversation = await getConversationById(db, conversationId);
  if (!conversation) {
    return errorResponse(c, 404, ERROR_CODES.CONVERSATION_NOT_FOUND, 'Conversation not found');
  }

  if (conversation.userId !== userId) {
    return errorResponse(c, 403, ERROR_CODES.FORBIDDEN, 'Unauthorized');
  }

  const now = new Date();

  await createMessage(db, {
    id: generateId(),
    userId,
    conversationId,
    role: 'user',
    message,
    files: files || null,
    generatedImageUrls: null,
    searchResults: null,
    createdAt: now,
  });

  const history = await getRecentMessages(db, conversationId, 20);
  const openAiMessages: Array<{ role: string; content: string | Array<unknown> }> = [];

  for (const msg of history) {
    if (msg.role === 'user') {
      if (msg.files && msg.files.length > 0) {
        const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
          { type: 'text', text: msg.message },
        ];

        for (const file of msg.files) {
          if (file.mimeType.startsWith('image/')) {
            content.push({ type: 'image_url', image_url: { url: file.url } });
          }
        }
        openAiMessages.push({ role: 'user', content });
      } else {
        openAiMessages.push({ role: 'user', content: msg.message });
      }
    } else {
      openAiMessages.push({ role: 'assistant', content: msg.message });
    }
  }

  const openai = new OpenAI({
    apiKey: c.env.OPENROUTER_API_KEY,
    baseURL: c.env.OPENROUTER_BASE_URL,
  });
  const modelCandidates = Array.from(
    new Set(
      [
        model,
        c.env.OPENROUTER_FALLBACK_MODEL?.trim(),
        c.env.OPENROUTER_SUGGESTION_MODEL?.trim(),
      ].filter((value): value is string => Boolean(value))
    )
  );

  let activeModel = modelCandidates[0] || model;
  const baseReasoningEffort = THINKING_EFFORT_BY_MODE[thinkMode];
  const modelInitTimeoutMs = 30_000;
  const transientRetryAttempts = 2;

  const isRetryableNetworkError = (error: unknown): boolean => {
    const { message } = toModelErrorDetail(error);
    const text = message.toLowerCase();
    return (
      text.includes('network connection lost') ||
      text.includes('fetch failed') ||
      text.includes('connection') ||
      text.includes('socket') ||
      text.includes('econnreset') ||
      text.includes('etimedout') ||
      text.includes('timeout')
    );
  };

  const sleep = async (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const runWithTransientRetry = async <T>(label: string, task: () => Promise<T>): Promise<T> => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= transientRetryAttempts; attempt++) {
      try {
        return await task();
      } catch (error) {
        lastError = error;
        if (!isRetryableNetworkError(error) || attempt === transientRetryAttempts) {
          throw error;
        }
        console.warn('chat_stream_transient_retry', {
          traceId,
          label,
          attempt,
          error: toModelErrorDetail(error),
        });
        await sleep(250 * attempt);
      }
    }

    throw lastError ?? new Error('Unknown transient retry failure');
  };

  const createStreamWith = async (
    modelName: string,
    reasoningEffort: OpenAI.Chat.ChatCompletionReasoningEffort
  ) => {
    return runWithTransientRetry(`stream:${modelName}:${reasoningEffort}`, async () => {
      const streamPromise = openai.chat.completions.create({
        model: modelName,
        messages: openAiMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        stream: true,
        max_tokens: RESPONSE_MAX_TOKENS,
        ...(thinkMode === 'instant' ? {} : { reasoning_effort: reasoningEffort }),
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          clearTimeout(timer);
          reject(new Error(`MODEL_INIT_TIMEOUT_${modelInitTimeoutMs}ms`));
        }, modelInitTimeoutMs);
      });

      return Promise.race([streamPromise, timeoutPromise]);
    });
  };

  const createNonStreamWith = async (
    modelName: string,
    reasoningEffort: OpenAI.Chat.ChatCompletionReasoningEffort
  ) => {
    return runWithTransientRetry(`nonstream:${modelName}:${reasoningEffort}`, async () => {
      const completionPromise = openai.chat.completions.create({
        model: modelName,
        messages: openAiMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        stream: false,
        max_tokens: RESPONSE_MAX_TOKENS,
        ...(thinkMode === 'instant' ? {} : { reasoning_effort: reasoningEffort }),
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          clearTimeout(timer);
          reject(new Error(`MODEL_NON_STREAM_TIMEOUT_${modelInitTimeoutMs}ms`));
        }, modelInitTimeoutMs);
      });

      return Promise.race([completionPromise, timeoutPromise]);
    });
  };

  let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  const attemptPlan: Array<{ model: string; effort: OpenAI.Chat.ChatCompletionReasoningEffort }> = [];
  attemptPlan.push({ model: activeModel, effort: baseReasoningEffort });
  if (baseReasoningEffort !== 'low') {
    attemptPlan.push({ model: activeModel, effort: 'low' });
  }
  for (const candidateModel of modelCandidates.slice(1)) {
    attemptPlan.push({ model: candidateModel, effort: 'low' });
  }

  const attemptLogs: Array<{
    model: string;
    effort: OpenAI.Chat.ChatCompletionReasoningEffort;
    durationMs: number;
    ok: boolean;
    error?: ModelErrorDetail;
  }> = [];

  let initialized = false;
  for (const attempt of attemptPlan) {
    const attemptStartedAt = Date.now();
    try {
      stream = await createStreamWith(attempt.model, attempt.effort);
      const durationMs = Date.now() - attemptStartedAt;
      attemptLogs.push({ model: attempt.model, effort: attempt.effort, durationMs, ok: true });
      activeModel = attempt.model;
      initialized = true;
      break;
    } catch (error) {
      const durationMs = Date.now() - attemptStartedAt;
      attemptLogs.push({
        model: attempt.model,
        effort: attempt.effort,
        durationMs,
        ok: false,
        error: toModelErrorDetail(error),
      });
    }
  }

  if (!initialized) {
    console.error('chat_stream_init_failed', {
      traceId,
      userId,
      conversationId,
      requestedModel: model,
      candidates: modelCandidates,
      attempts: attemptLogs,
      elapsedMs: Date.now() - requestStartedAt,
    });
    return errorResponse(c, 500, ERROR_CODES.STREAM_FAILED, `Model request failed. traceId=${traceId}`);
  }

  console.info('chat_stream_init_ok', {
    traceId,
    userId,
    conversationId,
    requestedModel: model,
    activeModel,
    attempts: attemptLogs,
    elapsedMs: Date.now() - requestStartedAt,
  });

  const suggestionModel = c.env.OPENROUTER_SUGGESTION_MODEL || activeModel;

  await updateConversation(db, conversationId, { updatedAt: now });

  const encoder = new TextEncoder();
  let fullResponse = '';
  let firstChunkLatencyMs: number | null = null;
  let assistantMessageSaved = false;

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            if (firstChunkLatencyMs === null) {
              firstChunkLatencyMs = Date.now() - requestStartedAt;
            }
            fullResponse += content;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'message', message: content })}\n\n`)
            );
          }
        }

        await createMessage(db, {
          id: generateId(),
          userId,
          conversationId,
          role: 'assistant',
          message: fullResponse,
          files: null,
          generatedImageUrls: null,
          searchResults: null,
          createdAt: new Date(),
        });
        assistantMessageSaved = true;

        let suggestions: string[] = [];
        try {
          suggestions = await generateFollowUpSuggestions({
            openai,
            model: suggestionModel,
            answerText: fullResponse,
          });
        } catch (error) {
          console.warn('Suggestions generation failed, continuing without suggestions.', error);
        }

        if (!conversation.title) {
          const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
          await updateConversation(db, conversationId, { title });
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'suggestions', suggestions })}\n\n`)
        );
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();
        console.info('chat_stream_done', {
          traceId,
          userId,
          conversationId,
          activeModel,
          suggestionModel,
          responseChars: fullResponse.length,
          firstChunkLatencyMs,
          elapsedMs: Date.now() - requestStartedAt,
        });
      } catch (error) {
        const runtimeError = toModelErrorDetail(error);
        console.error('chat_stream_runtime_error', {
          traceId,
          userId,
          conversationId,
          activeModel,
          error: runtimeError,
          responseChars: fullResponse.length,
          firstChunkLatencyMs,
          elapsedMs: Date.now() - requestStartedAt,
        });

        // If partial content already exists, finalize gracefully instead of surfacing an error.
        if (fullResponse.trim().length > 0) {
          if (!assistantMessageSaved) {
            try {
              await createMessage(db, {
                id: generateId(),
                userId,
                conversationId,
                role: 'assistant',
                message: fullResponse,
                files: null,
                generatedImageUrls: null,
                searchResults: null,
                createdAt: new Date(),
              });
            } catch (persistError) {
              console.error('chat_stream_partial_persist_failed', {
                traceId,
                userId,
                conversationId,
                error: toModelErrorDetail(persistError),
              });
            }
          }

          // Never fail user-visible response when we already have model output.
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'suggestions', suggestions: [] })}\n\n`)
          );
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
          return;
        }

        // Recovery path: fallback to a non-stream completion once.
        try {
          let recoveredText = '';
          for (const candidateModel of modelCandidates) {
            try {
              const completion = await createNonStreamWith(candidateModel, 'low');
              recoveredText = parseCompletionText(completion);

              if (recoveredText.trim()) {
                activeModel = candidateModel;
                break;
              }
            } catch (recoverError) {
              console.warn('chat_stream_recovery_attempt_failed', {
                traceId,
                model: candidateModel,
                error: toModelErrorDetail(recoverError),
              });
            }
          }

          if (recoveredText.trim()) {
            await createMessage(db, {
              id: generateId(),
              userId,
              conversationId,
              role: 'assistant',
              message: recoveredText,
              files: null,
              generatedImageUrls: null,
              searchResults: null,
              createdAt: new Date(),
            });

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'message', message: recoveredText })}\n\n`)
            );
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'suggestions', suggestions: [] })}\n\n`)
            );
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
            controller.close();
            return;
          }
        } catch (recoveryFatalError) {
          console.error('chat_stream_recovery_fatal_error', {
            traceId,
            userId,
            conversationId,
            error: toModelErrorDetail(recoveryFatalError),
          });
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'error',
              error: `Stream failed (${runtimeError.name}: ${runtimeError.message}). traceId=${traceId}`,
              code: ERROR_CODES.STREAM_FAILED,
            })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

chat.post('/respond', zValidator('json', streamRequestSchema, validationErrorHook), async (c) => {
  const traceId = generateId();
  c.header('X-Trace-Id', traceId);

  const { userId } = getAuthInfo(c);
  const {
    conversationId,
    message,
    files,
    model: requestedModel,
    thinkMode = 'think',
  } = c.req.valid('json');
  const model = requestedModel || c.env.OPENROUTER_CHAT_MODEL || 'gpt-5.3-codex';
  const db = createDb(c.env.DB);

  const conversation = await getConversationById(db, conversationId);
  if (!conversation) {
    return errorResponse(c, 404, ERROR_CODES.CONVERSATION_NOT_FOUND, 'Conversation not found');
  }

  if (conversation.userId !== userId) {
    return errorResponse(c, 403, ERROR_CODES.FORBIDDEN, 'Unauthorized');
  }

  const now = new Date();
  await createMessage(db, {
    id: generateId(),
    userId,
    conversationId,
    role: 'user',
    message,
    files: files || null,
    generatedImageUrls: null,
    searchResults: null,
    createdAt: now,
  });

  const history = await getRecentMessages(db, conversationId, 20);
  const openAiMessages: Array<{ role: string; content: string | Array<unknown> }> = [];
  for (const msg of history) {
    if (msg.role === 'user') {
      if (msg.files && msg.files.length > 0) {
        const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
          { type: 'text', text: msg.message },
        ];
        for (const file of msg.files) {
          if (file.mimeType.startsWith('image/')) {
            content.push({ type: 'image_url', image_url: { url: file.url } });
          }
        }
        openAiMessages.push({ role: 'user', content });
      } else {
        openAiMessages.push({ role: 'user', content: msg.message });
      }
    } else {
      openAiMessages.push({ role: 'assistant', content: msg.message });
    }
  }

  const openai = new OpenAI({
    apiKey: c.env.OPENROUTER_API_KEY,
    baseURL: c.env.OPENROUTER_BASE_URL,
  });
  const candidates = Array.from(
    new Set([model, c.env.OPENROUTER_FALLBACK_MODEL?.trim()].filter((v): v is string => Boolean(v)))
  );

  let activeModel = candidates[0] || model;
  let answerText = '';
  const attemptLogs: Array<{ model: string; effort: string | null; error?: ModelErrorDetail }> = [];

  for (const candidate of candidates) {
    const effortPlan = EFFORT_PLAN_BY_MODE[thinkMode];
    for (const effort of effortPlan) {
      try {
        const completion = await withModelTimeout(
          () =>
            openai.chat.completions.create({
              model: candidate,
              messages: openAiMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
              stream: false,
              max_tokens: RESPONSE_MAX_TOKENS,
              ...(thinkMode === 'instant' ? {} : { reasoning_effort: effort }),
            }),
          MODEL_CALL_TIMEOUT_MS
        );
        const text = parseCompletionText(completion);
        if (text.trim()) {
          answerText = text;
          activeModel = candidate;
          break;
        }
        attemptLogs.push({
          model: candidate,
          effort,
          error: {
            name: 'EmptyCompletionError',
            message: 'Model returned completion without parseable text',
            body: summarizeCompletionPayload(completion),
          },
        });
      } catch (error) {
        attemptLogs.push({ model: candidate, effort, error: toModelErrorDetail(error) });
      }
    }
    if (answerText.trim()) break;
  }

  if (!answerText.trim()) {
    console.error('chat_respond_failed', {
      traceId,
      userId,
      conversationId,
      model,
      attempts: attemptLogs,
    });
    return errorResponse(c, 500, ERROR_CODES.MODEL_REQUEST_FAILED, `Model request failed. traceId=${traceId}`);
  }

  await createMessage(db, {
    id: generateId(),
    userId,
    conversationId,
    role: 'assistant',
    message: answerText,
    files: null,
    generatedImageUrls: null,
    searchResults: null,
    createdAt: new Date(),
  });

  let suggestions: string[] = [];
  const suggestionModel = c.env.OPENROUTER_SUGGESTION_MODEL || activeModel;
  try {
    suggestions = await generateFollowUpSuggestions({
      openai,
      model: suggestionModel,
      answerText,
    });
  } catch (error) {
    console.warn('Respond suggestions generation failed', { traceId, error });
  }

  await updateConversation(db, conversationId, { updatedAt: now });
  if (!conversation.title) {
    const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
    await updateConversation(db, conversationId, { title });
  }

  return c.json({
    success: true,
    data: {
      message: answerText,
      suggestions,
      model: activeModel,
      traceId,
    },
  });
});

chat.post('/respond/stream', zValidator('json', streamRequestSchema, validationErrorHook), async (c) => {
  const traceId = generateId();
  c.header('X-Trace-Id', traceId);
  const encoder = new TextEncoder();

  const emit = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    payload: Record<string, unknown>
  ) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  };

  const { userId } = getAuthInfo(c);
  const {
    conversationId,
    message,
    files,
    model: requestedModel,
    thinkMode = 'think',
  } = c.req.valid('json');
  const model = requestedModel || c.env.OPENROUTER_CHAT_MODEL || 'gpt-5.3-codex';
  const db = createDb(c.env.DB);

  const conversation = await getConversationById(db, conversationId);
  if (!conversation) {
    return errorResponse(c, 404, ERROR_CODES.CONVERSATION_NOT_FOUND, 'Conversation not found');
  }

  if (conversation.userId !== userId) {
    return errorResponse(c, 403, ERROR_CODES.FORBIDDEN, 'Unauthorized');
  }

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        emit(controller, { type: 'stage', stage: 'context', label: '正在准备上下文', traceId });

        const now = new Date();
        await createMessage(db, {
          id: generateId(),
          userId,
          conversationId,
          role: 'user',
          message,
          files: files || null,
          generatedImageUrls: null,
          searchResults: null,
          createdAt: now,
        });

        const history = await getRecentMessages(db, conversationId, 20);
        const openAiMessages: Array<{ role: string; content: string | Array<unknown> }> = [];
        for (const msg of history) {
          if (msg.role === 'user') {
            if (msg.files && msg.files.length > 0) {
              const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
                { type: 'text', text: msg.message },
              ];
              for (const file of msg.files) {
                if (file.mimeType.startsWith('image/')) {
                  content.push({ type: 'image_url', image_url: { url: file.url } });
                }
              }
              openAiMessages.push({ role: 'user', content });
            } else {
              openAiMessages.push({ role: 'user', content: msg.message });
            }
          } else {
            openAiMessages.push({ role: 'assistant', content: msg.message });
          }
        }

        const openai = new OpenAI({
          apiKey: c.env.OPENROUTER_API_KEY,
          baseURL: c.env.OPENROUTER_BASE_URL,
        });
        const candidates = Array.from(
          new Set([model, c.env.OPENROUTER_FALLBACK_MODEL?.trim()].filter((v): v is string => Boolean(v)))
        );
        emit(controller, { type: 'stage', stage: 'model', label: '正在调用模型服务', traceId });

        let activeModel = candidates[0] || model;
        let answerText = '';
        for (const candidate of candidates) {
          const effortPlan = EFFORT_PLAN_BY_MODE[thinkMode];
          for (const effort of effortPlan) {
            try {
              const completion = await withModelTimeout(
                () =>
                  openai.chat.completions.create({
                    model: candidate,
                    messages: openAiMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
                    stream: false,
                    max_tokens: RESPONSE_MAX_TOKENS,
                    ...(thinkMode === 'instant' ? {} : { reasoning_effort: effort }),
                  }),
                MODEL_CALL_TIMEOUT_MS
              );
              const text = parseCompletionText(completion);
              if (text.trim()) {
                answerText = text;
                activeModel = candidate;
                break;
              }
              console.warn('chat_respond_stream_empty_completion', {
                traceId,
                model: candidate,
                effort,
                completion: summarizeCompletionPayload(completion),
              });
            } catch {
              // continue trying other candidates
            }
          }
          if (answerText.trim()) break;
        }

        if (!answerText.trim()) {
          emit(controller, {
            type: 'error',
            code: ERROR_CODES.STREAM_FAILED,
            error: `Model request failed. traceId=${traceId}`,
            traceId,
          });
          controller.close();
          return;
        }

        emit(controller, { type: 'stage', stage: 'postprocess', label: '正在整理最终答案', traceId });

        await createMessage(db, {
          id: generateId(),
          userId,
          conversationId,
          role: 'assistant',
          message: answerText,
          files: null,
          generatedImageUrls: null,
          searchResults: null,
          createdAt: new Date(),
        });

        let suggestions: string[] = [];
        const suggestionModel = c.env.OPENROUTER_SUGGESTION_MODEL || activeModel;
        try {
          suggestions = await generateFollowUpSuggestions({
            openai,
            model: suggestionModel,
            answerText,
          });
        } catch {
          suggestions = [];
        }

        await updateConversation(db, conversationId, { updatedAt: now });
        if (!conversation.title) {
          const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
          await updateConversation(db, conversationId, { title });
        }

        emit(controller, { type: 'message', message: answerText, traceId });
        emit(controller, { type: 'suggestions', suggestions, traceId });
        emit(controller, { type: 'done', traceId });
        controller.close();
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        emit(controller, {
          type: 'error',
          code: ERROR_CODES.STREAM_FAILED,
          error: `Respond stream failed: ${messageText}. traceId=${traceId}`,
          traceId,
        });
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

chat.get(
  '/conversations/:id/messages',
  zValidator('param', conversationIdParamSchema, validationErrorHook),
  async (c) => {
    const { userId } = getAuthInfo(c);
    const { id } = c.req.valid('param');
    const db = createDb(c.env.DB);

    const conversation = await getConversationById(db, id);
    if (!conversation) {
      return errorResponse(c, 404, ERROR_CODES.CONVERSATION_NOT_FOUND, 'Conversation not found');
    }

    if (conversation.userId !== userId) {
      return errorResponse(c, 403, ERROR_CODES.FORBIDDEN, 'Unauthorized');
    }

    const messages = await getRecentMessages(db, id, 100);
    return c.json({ success: true, data: { messages } });
  }
);

export default chat;
