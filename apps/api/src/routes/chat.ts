import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppBindings, Env } from '../store-context';
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
import { generateFollowUpSuggestions, parseAndFinalizeSuggestions } from '../utils/suggestions';
import OpenAI from 'openai';
import { MCPManager } from '../mcp/manager';
import { parseToolCalls, type ToolCall } from '../mcp/parser';
import type { MessageFile } from '@chatwithme/shared';

const CODE_EXTENSIONS = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp', 'cs', 'rb', 'php', 'sh', 'json', 'yaml', 'yml', 'toml', 'md', 'txt'];
const OFFICE_EXTENSIONS = ['pptx', 'xlsx', 'docx'];

function isCodeFile(file: MessageFile): boolean {
  const ext = file.fileName.split('.').pop()?.toLowerCase();
  return CODE_EXTENSIONS.includes(ext || '');
}

function isOfficeFile(file: MessageFile): boolean {
  const ext = file.fileName.split('.').pop()?.toLowerCase();
  return OFFICE_EXTENSIONS.includes(ext || '');
}

async function readFileContentFromDataURL(url: string): Promise<string> {
  if (url.startsWith('data:')) {
    const matches = url.match(/^data:[^;]+;base64,(.+)$/);
    if (matches) {
      const base64 = matches[1];
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoder = new TextDecoder('utf-8');
      return decoder.decode(bytes);
    }
  }
  return '';
}

function detectVisionModel(
  messages: Array<{ role: string; content: string | Array<unknown>; files?: MessageFile[] }>,
  env: Env
): string {
  const currentUserMessage = messages[messages.length - 1];
  const hasVisionContent = currentUserMessage?.files?.some(f =>
    f.mimeType.startsWith('image/') ||
    f.mimeType === 'application/pdf' ||
    f.mimeType.startsWith('application/vnd.openxmlformats-officedocument')
  ) ?? false;

  if (hasVisionContent) {
    return env.OPENROUTER_VISION_MODEL || env.OPENROUTER_CHAT_MODEL || 'glm-4.6v';
  }
  return env.OPENROUTER_CHAT_MODEL || 'GLM-4.7';
}

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

const chatRequestSchema = z.object({
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
});
const MODEL_CALL_TIMEOUT_MS = 90000;
const MODEL_HEALTH_CACHE_TTL_MS = 60_000;
const MODEL_HEALTH_PROBE_TIMEOUT_MS = 8_000;
type ResponseFormat = 'text' | 'json_object';
type StructuredReply = {
  message: string;
  suggestions: string[];
};

type ModelHealthProbeResult = {
  ok: boolean;
  latencyMs: number;
  checkedAt: number;
  error?: {
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
};

const modelHealthProbeCache = new Map<string, ModelHealthProbeResult>();

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

function parseJsonObjectFromText(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;

  const candidates = [
    cleaned,
    cleaned
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim(),
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function parseStructuredReply(raw: string): StructuredReply | null {
  const parsed = parseJsonObjectFromText(raw);
  if (!parsed) return null;

  const message =
    typeof parsed.message === 'string'
      ? parsed.message.trim()
      : typeof parsed.answer === 'string'
        ? parsed.answer.trim()
        : '';
  if (!message) return null;

  let suggestionsRaw = '';
  if (Array.isArray(parsed.suggestions)) {
    suggestionsRaw = JSON.stringify(parsed.suggestions);
  } else if (typeof parsed.suggestions === 'string') {
    suggestionsRaw = parsed.suggestions;
  }

  return {
    message,
    suggestions: parseAndFinalizeSuggestions(suggestionsRaw, message),
  };
}

function buildStructuredReplyMessages(messages: Array<{ role: string; content: string | Array<unknown> }>, hasTools: boolean = false): Array<{
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}> {
  let systemInstruction = `You are a helpful assistant.
Return only a JSON object with this schema:
{"message":"<assistant reply>","suggestions":["<q1>","<q2>","<q3>"]}
Rules:
- suggestions must contain exactly 3 concise follow-up questions.
- suggestions must be relevant to the message.
- no markdown code fences.`;

  if (hasTools) {
    systemInstruction += `

Available Tools:
- webSearchPrime: Search the internet for latest news, current events, and real-time information. Use this when users ask about news, recent events, or time-sensitive topics.
- webReader: Read and analyze web page content. Use this when users provide a URL or ask about a specific website.

IMPORTANT: When users ask for news, current events, or real-time information, you MUST use the webSearchPrime tool to fetch accurate, up-to-date information. Do not claim you cannot access the internet.`;
  }

  const normalized = messages.flatMap((item) => {
    const role =
      item.role === 'assistant' || item.role === 'system' ? item.role : 'user';

    // Preserve array content format (for images), convert others to string
    if (Array.isArray(item.content)) {
      // Keep array format for images
      if (!item.content || item.content.length === 0) return [];
      return [{ role, content: item.content as Array<{ type: string; text?: string; image_url?: { url: string } }> }];
    } else {
      const content = item.content?.trim();
      if (!content) return [];
      return [{ role, content }];
    }
  }) as Array<{ role: 'system' | 'user' | 'assistant'; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>;

  return [{ role: 'system', content: systemInstruction }, ...normalized];
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


function buildNonStreamingChatCompletionParams(params: {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>;
  responseFormat?: ResponseFormat;
  maxTokens?: number;
  tools?: OpenAI.Chat.ChatCompletionTool[];
  tool_choice?: 'auto' | 'required';
}): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
  const { model, messages, responseFormat = 'text', maxTokens, tools, tool_choice } = params;
  const payload: Record<string, unknown> = {
    model,
    messages,
    stream: false,
  };
  if (typeof maxTokens === 'number') payload.max_tokens = maxTokens;

  if (responseFormat === 'json_object') {
    payload.response_format = { type: 'json_object' };
  }

  if (tools) {
    payload.tools = tools;
    if (tool_choice) {
      payload.tool_choice = tool_choice;
    }
  }

  return payload as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
}

async function probeModelHealth(
  openai: OpenAI,
  modelName: string,
  traceId: string
): Promise<ModelHealthProbeResult> {
  const cached = modelHealthProbeCache.get(modelName);
  const now = Date.now();
  if (cached && now - cached.checkedAt <= MODEL_HEALTH_CACHE_TTL_MS) {
    return cached;
  }

  const startedAt = Date.now();
  try {
    const completionPromise = openai.chat.completions.create(
      buildNonStreamingChatCompletionParams({
        model: modelName,
        messages: [{ role: 'user', content: 'Respond with exactly: ok' }],
        maxTokens: 16,
      })
    );
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error(`MODEL_HEALTH_PROBE_TIMEOUT_${MODEL_HEALTH_PROBE_TIMEOUT_MS}ms`));
      }, MODEL_HEALTH_PROBE_TIMEOUT_MS);
    });

    const completion = (await Promise.race([completionPromise, timeoutPromise])) as unknown;
    const text = parseCompletionText(completion);
    const result: ModelHealthProbeResult = {
      ok: Boolean(text.trim()),
      latencyMs: Date.now() - startedAt,
      checkedAt: now,
      error: text.trim()
        ? undefined
        : {
            name: 'EmptyCompletionError',
            message: 'Health probe returned completion without parseable text',
            body: summarizeCompletionPayload(completion),
          },
    };

    modelHealthProbeCache.set(modelName, result);
    if (!result.ok) {
      console.warn('chat_model_health_probe_empty', {
        traceId,
        model: modelName,
        latencyMs: result.latencyMs,
      });
    }
    return result;
  } catch (error) {
    const result: ModelHealthProbeResult = {
      ok: false,
      latencyMs: Date.now() - startedAt,
      checkedAt: now,
      error: toModelErrorDetail(error),
    };
    modelHealthProbeCache.set(modelName, result);
    console.warn('chat_model_health_probe_failed', {
      traceId,
      model: modelName,
      latencyMs: result.latencyMs,
      error: result.error,
    });
    return result;
  }
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


chat.post('/respond', zValidator('json', chatRequestSchema, validationErrorHook), async (c) => {
  const traceId = generateId();
  c.header('X-Trace-Id', traceId);

  const { userId } = getAuthInfo(c);
  const {
    conversationId,
    message,
    files,
    model: requestedModel,
  } = c.req.valid('json');
  const db = createDb(c.env.DB);

  const conversation = await getConversationById(db, conversationId);
  if (!conversation) {
    return errorResponse(c, 404, ERROR_CODES.CONVERSATION_NOT_FOUND, 'Conversation not found');
  }

  if (conversation.userId !== userId) {
    return errorResponse(c, 403, ERROR_CODES.FORBIDDEN, 'Unauthorized');
  }

  // Fetch history for model detection
  const historyForModelDetection = await getRecentMessages(db, conversationId, 20);

  const model = requestedModel || detectVisionModel(
    [...historyForModelDetection.map(msg => ({
      role: msg.role,
      content: msg.message,
      files: msg.files || undefined
    })), { role: 'user', content: message, files }],
    c.env
  ) || c.env.OPENROUTER_CHAT_MODEL || 'gpt-5.3-codex';

  // Process files: upload image/PDF/Office dataURLs to R2 and get API URLs
  let processedFiles = files;
  if (files && files.length > 0) {
    processedFiles = await Promise.all(files.map(async (file) => {
      // For images, PDFs, and Office docs with dataURL, upload to R2 and get API URL
      if ((file.mimeType.startsWith('image/') ||
           file.mimeType === 'application/pdf' ||
           file.mimeType.startsWith('application/vnd.openxmlformats-officedocument')) && file.url.startsWith('data:')) {
        try {
          // Parse dataURL
          const matches = file.url.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            const mimeType = matches[1];
            const base64Data = matches[2];
            const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

            // Generate file key and upload to R2
            let ext = 'bin';
            if (mimeType === 'application/pdf') ext = 'pdf';
            else if (mimeType === 'image/jpeg') ext = 'jpg';
            else if (mimeType === 'image/png') ext = 'png';
            else if (mimeType === 'image/gif') ext = 'gif';
            else if (mimeType === 'image/webp') ext = 'webp';
            else if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') ext = 'pptx';
            else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') ext = 'xlsx';
            else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') ext = 'docx';

            const key = `uploads/${userId}/${generateId()}.${ext}`;

            console.log(`Uploading file to R2: ${key}, size: ${buffer.length} bytes, mimeType: ${mimeType}`);
            await c.env.BUCKET.put(key, buffer, {
              httpMetadata: { contentType: mimeType },
            });
            console.log(`Upload successful: ${key}`);

            // Construct download URL
            const url = new URL(c.req.url);
            const downloadUrl = `${url.origin}/file/download/${key}`;
            console.log(`Download URL: ${downloadUrl}`);

            return {
              ...file,
              url: downloadUrl
            };
          }
        } catch (error) {
          console.error('Failed to upload file to R2:', error);
          // Fall back to original dataURL if upload fails
        }
      }
      return file;
    }));
  }

  const now = new Date();
  await createMessage(db, {
    id: generateId(),
    userId,
    conversationId,
    role: 'user',
    message,
    files: processedFiles || null,
    generatedImageUrls: null,
    searchResults: null,
    createdAt: now,
  });

  // Re-fetch history after creating the new message
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
          } else if (file.mimeType === 'application/pdf') {
            content.push({ type: 'image_url', image_url: { url: file.url } });
          } else if (isOfficeFile(file)) {
            // Office documents are treated as vision content
            content.push({ type: 'image_url', image_url: { url: file.url } });
          } else if (isCodeFile(file)) {
            const fileContent = await readFileContentFromDataURL(file.url);
            if (fileContent) {
              content[0].text += `\n\n--- File: ${file.fileName} ---\n${fileContent}`;
            }
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

  // Initialize MCP Manager
  const mcpManager = new MCPManager(c.env);
  const mcpTools = mcpManager.isConfigured() ? mcpManager.getAvailableTools() : undefined;

  let activeModel = candidates[0] || model;
  let answerText = '';
  let bundledSuggestions: string[] = [];
  const attemptLogs: Array<{ model: string; error?: ModelErrorDetail }> = [];

  // Build messages for LLM call
  const hasMcpTools = mcpManager.isConfigured();
  const llmMessages = buildStructuredReplyMessages(openAiMessages, hasMcpTools);
  let enhancedMessages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>; tool_call_id?: string; tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[] }> = [...llmMessages];

  // First LLM call: Check if tools are needed
  // Note: When tools are present, we use 'text' format to allow function calling
  // GLM-4.7 cannot simultaneously return both tool_calls and json_object format
  for (const candidate of candidates) {
    try {
      const completion = await withModelTimeout(
        () =>
          openai.chat.completions.create(
            buildNonStreamingChatCompletionParams({
              model: candidate,
              messages: enhancedMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>,
              responseFormat: mcpTools ? 'text' : 'json_object',
              tools: mcpTools,
              tool_choice: mcpTools ? 'auto' : undefined,
            })
          ),
        MODEL_CALL_TIMEOUT_MS
      );

      // Check for tool calls
      const toolCalls = parseToolCalls(completion);

      if (toolCalls.length > 0 && mcpManager.isConfigured()) {
        // Execute tools
        const toolResult = await mcpManager.executeToolCalls(toolCalls);

        // Add assistant message with tool calls
        enhancedMessages.push({
          role: 'assistant',
          content: completion.choices[0]?.message?.content || undefined,
          tool_calls: completion.choices[0]?.message?.tool_calls || undefined,
        } as typeof enhancedMessages[number]);

        // Add tool results
        enhancedMessages.push({
          role: 'tool',
          tool_call_id: toolCalls[0].id,
          content: toolResult.results,
        });

        // Second LLM call: Generate final response with tool results
        // After tools are executed, we can use json_object format since no more tools will be called
        const finalCompletion = await withModelTimeout(
          () =>
            openai.chat.completions.create(
              buildNonStreamingChatCompletionParams({
                model: candidate,
                messages: enhancedMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>,
                responseFormat: 'json_object',
              })
            ),
          MODEL_CALL_TIMEOUT_MS
        );

        const text = parseCompletionText(finalCompletion);
        const structured = parseStructuredReply(text);
        if (structured) {
          answerText = structured.message;
          bundledSuggestions = structured.suggestions;
          activeModel = candidate;
          break;
        }
        // Fallback: if structured parsing fails, use the text directly
        if (text) {
          answerText = text;
          // Generate simple suggestions for tool-based responses
          bundledSuggestions = await generateFollowUpSuggestions({
            openai,
            model: candidate,
            answerText: text,
          });
          activeModel = candidate;
          break;
        }
      } else {
        // No tools needed, use original completion
        // When mcpTools were provided but no tools were called, the response is plain text
        // When no mcpTools were provided, the response is structured JSON
        const text = parseCompletionText(completion);
        const structured = parseStructuredReply(text);
        if (structured) {
          // Structured reply (no tools were configured)
          answerText = structured.message;
          bundledSuggestions = structured.suggestions;
          activeModel = candidate;
          break;
        }
        // Fallback: if tools were configured but not called, use plain text
        if (text && mcpTools) {
          answerText = text;
          // Generate simple suggestions for tool-based responses
          bundledSuggestions = await generateFollowUpSuggestions({
            openai,
            model: candidate,
            answerText: text,
          });
          activeModel = candidate;
          break;
        }
      }

      attemptLogs.push({
        model: candidate,
        error: {
          name: 'InvalidStructuredReplyError',
          message: 'Model returned completion without parseable structured reply',
          body: summarizeCompletionPayload(completion),
        },
      });
    } catch (error) {
      attemptLogs.push({ model: candidate, error: toModelErrorDetail(error) });
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

  await updateConversation(db, conversationId, { updatedAt: now });
  if (!conversation.title) {
    const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
    await updateConversation(db, conversationId, { title });
  }

  return c.json({
    success: true,
    data: {
      message: answerText,
      suggestions: bundledSuggestions,
      model: activeModel,
      traceId,
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
