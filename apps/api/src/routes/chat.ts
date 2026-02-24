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
  const { userId } = getAuthInfo(c);
  const {
    conversationId,
    message,
    files,
    model = 'gpt-5.3-codex',
    thinkMode = 'think',
  } = c.req.valid('json');
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
  const suggestionModel = c.env.OPENROUTER_SUGGESTION_MODEL || model;

  const stream = await openai.chat.completions.create({
    model,
    messages: openAiMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    stream: true,
    reasoning_effort: THINKING_EFFORT_BY_MODE[thinkMode],
  });

  await updateConversation(db, conversationId, { updatedAt: now });

  const encoder = new TextEncoder();
  let fullResponse = '';

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
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

        const suggestions = await generateFollowUpSuggestions({
          openai,
          model: suggestionModel,
          answerText: fullResponse,
        });

        if (!conversation.title) {
          const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
          await updateConversation(db, conversationId, { title });
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'suggestions', suggestions })}\n\n`)
        );
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();
      } catch (error) {
        console.error('Stream error:', error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', error: 'Stream failed', code: ERROR_CODES.STREAM_FAILED })}\n\n`
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
