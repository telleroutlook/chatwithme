import { Hono } from 'hono';
import type { Env } from '../store-context';
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
import type { SendMessageRequest, Conversation, Message } from '@chatwithme/shared';
import OpenAI from 'openai';

const chat = new Hono<{ Bindings: Env }>();

// All chat routes require authentication
chat.use('/*', authMiddleware);

// Get all conversations for the current user
chat.get('/conversations', async (c) => {
  const { userId } = getAuthInfo(c);
  const db = createDb(c.env.DB);

  const conversations = await getConversationsByUserId(db, userId);

  return c.json({ success: true, data: { conversations } });
});

// Create a new conversation
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

// Get a single conversation
chat.get('/conversations/:id', async (c) => {
  const { userId } = getAuthInfo(c);
  const { id } = c.req.param();
  const db = createDb(c.env.DB);

  const conversation = await getConversationById(db, id);

  if (!conversation) {
    return c.json({ success: false, error: 'Conversation not found' }, 404);
  }

  if (conversation.userId !== userId) {
    return c.json({ success: false, error: 'Unauthorized' }, 403);
  }

  // Get messages for this conversation
  const messages = await getRecentMessages(db, id, 100);

  return c.json({ success: true, data: { conversation, messages } });
});

// Update a conversation
chat.patch('/conversations/:id', async (c) => {
  const { userId } = getAuthInfo(c);
  const { id } = c.req.param();
  const body = await c.req.json<{ title?: string; starred?: boolean }>();
  const db = createDb(c.env.DB);

  const conversation = await getConversationById(db, id);

  if (!conversation) {
    return c.json({ success: false, error: 'Conversation not found' }, 404);
  }

  if (conversation.userId !== userId) {
    return c.json({ success: false, error: 'Unauthorized' }, 403);
  }

  const updated = await updateConversation(db, id, {
    ...body,
    updatedAt: new Date(),
  });

  return c.json({ success: true, data: { conversation: updated } });
});

// Delete a conversation
chat.delete('/conversations/:id', async (c) => {
  const { userId } = getAuthInfo(c);
  const { id } = c.req.param();
  const db = createDb(c.env.DB);

  const conversation = await getConversationById(db, id);

  if (!conversation) {
    return c.json({ success: false, error: 'Conversation not found' }, 404);
  }

  if (conversation.userId !== userId) {
    return c.json({ success: false, error: 'Unauthorized' }, 403);
  }

  await deleteConversation(db, id);

  return c.json({ success: true, data: { message: 'Conversation deleted' } });
});

// Send a message and get streaming response
chat.post('/stream', async (c) => {
  const { userId } = getAuthInfo(c);
  const body = await c.req.json<SendMessageRequest>();
  const { conversationId, message, files, model = 'gpt-5.3-codex' } = body;
  const db = createDb(c.env.DB);

  // Verify conversation exists and belongs to user
  const conversation = await getConversationById(db, conversationId);
  if (!conversation) {
    return c.json({ success: false, error: 'Conversation not found' }, 404);
  }

  if (conversation.userId !== userId) {
    return c.json({ success: false, error: 'Unauthorized' }, 403);
  }

  const now = new Date();

  // Save user message
  const userMessage = await createMessage(db, {
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

  // Get conversation history for context
  const history = await getRecentMessages(db, conversationId, 20);

  // Format messages for OpenAI API
  const openAiMessages: Array<{ role: string; content: string | Array<unknown> }> = [];

  // Add history in chronological order
  for (const msg of history) {
    if (msg.role === 'user') {
      if (msg.files && msg.files.length > 0) {
        // Multimodal message with images
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

  // Create OpenAI client for OpenRouter
  const openai = new OpenAI({
    apiKey: c.env.OPENROUTER_API_KEY,
    baseURL: c.env.OPENROUTER_BASE_URL,
  });

  // Create streaming response
  const stream = await openai.chat.completions.create({
    model,
    messages: openAiMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    stream: true,
  });

  // Update conversation timestamp
  await updateConversation(db, conversationId, { updatedAt: now });

  // Create SSE stream
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

        // Save assistant message
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

        // Update conversation title if it's the first message
        if (!conversation.title) {
          const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
          await updateConversation(db, conversationId, { title });
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();
      } catch (error) {
        console.error('Stream error:', error);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Stream failed' })}\n\n`)
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

// Get messages for a conversation
chat.get('/conversations/:id/messages', async (c) => {
  const { userId } = getAuthInfo(c);
  const { id } = c.req.param();
  const db = createDb(c.env.DB);

  const conversation = await getConversationById(db, id);

  if (!conversation) {
    return c.json({ success: false, error: 'Conversation not found' }, 404);
  }

  if (conversation.userId !== userId) {
    return c.json({ success: false, error: 'Unauthorized' }, 403);
  }

  const messages = await getRecentMessages(db, id, 100);

  return c.json({ success: true, data: { messages } });
});

export default chat;
