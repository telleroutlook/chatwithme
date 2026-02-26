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
import { parseToolCalls } from '../mcp/parser';
import type { MessageFile } from '@chatwithme/shared';

const CODE_EXTENSIONS = [
  'js',
  'ts',
  'jsx',
  'tsx',
  'py',
  'java',
  'go',
  'rs',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'rb',
  'php',
  'sh',
  'json',
  'yaml',
  'yml',
  'toml',
  'md',
  'txt',
  'csv',
];
// Office documents: Word, Excel, PowerPoint, OpenDocument formats
const OFFICE_EXTENSIONS = ['pptx', 'xlsx', 'xls', 'xlsm', 'xlsb', 'docx', 'ods'];

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
  // Only images trigger Vision model
  // PDFs always use text extraction and go to regular chat model
  const hasVisionContent =
    currentUserMessage?.files?.some((f) => f.mimeType.startsWith('image/')) ?? false;

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
        extractedText: z.string().optional(), // For Office document text extraction
      })
    )
    .optional(),
  model: z.string().min(1).optional(),
});
const MODEL_CALL_TIMEOUT_MS = 90000;
const MODEL_HEALTH_CACHE_TTL_MS = 60_000;
const MODEL_HEALTH_PROBE_TIMEOUT_MS = 8_000;
type ResponseFormat = 'text' | 'json_object';

type ImageAnalysis = {
  fileName: string;
  analysis: string;
};

type StructuredReply = {
  message: string;
  suggestions: string[];
  imageAnalyses?: ImageAnalysis[];
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
    const priorityKeys = [
      'text',
      'content',
      'reasoning_content',
      'message',
      'output_text',
      'delta',
      'result',
    ];
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

interface JsonObjectFromTextResult {
  json: Record<string, unknown>;
  remaining: string;
}

function parseJsonObjectFromText(raw: string): JsonObjectFromTextResult | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;

  // Try parsing the entire string first
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return { json: parsed as Record<string, unknown>, remaining: '' };
    }
  } catch {
    // Continue to other strategies
  }

  // Try removing ```json markdown code blocks
  const withoutCodeBlock = cleaned
    .replace(/^```(?:json)?\s*\n/i, '')
    .replace(/\n```\s*$/i, '')
    .trim();
  if (withoutCodeBlock !== cleaned) {
    try {
      const parsed = JSON.parse(withoutCodeBlock) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        // Extract remaining content after the closing ```
        const lastCodeBlockEnd = cleaned.lastIndexOf('\n```');
        const remaining = lastCodeBlockEnd > 0 ? cleaned.slice(lastCodeBlockEnd + 4).trim() : '';
        return { json: parsed as Record<string, unknown>, remaining };
      }
    } catch {
      // Continue to other strategies
    }
  }

  // Find the first complete JSON object by brace matching
  const start = cleaned.indexOf('{');
  let braceCount = 0;
  let end = -1;

  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') braceCount++;
    if (cleaned[i] === '}') braceCount--;
    if (braceCount === 0 && i > start) {
      end = i;
      break;
    }
  }

  if (start !== -1 && end > start) {
    try {
      const jsonStr = cleaned.slice(start, end + 1);
      const parsed = JSON.parse(jsonStr) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const remaining = cleaned.slice(end + 1).trim();
        return { json: parsed as Record<string, unknown>, remaining };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function parseStructuredReply(raw: string): StructuredReply | null {
  const result = parseJsonObjectFromText(raw);
  if (!result) return null;

  const { json, remaining } = result;

  const message =
    typeof json.message === 'string'
      ? json.message.trim()
      : typeof json.answer === 'string'
        ? json.answer.trim()
        : '';
  if (!message) return null;

  // Append remaining content (e.g., code blocks after JSON) to the message
  const finalMessage = remaining ? `${message}\n\n${remaining}` : message;

  let suggestionsRaw = '';
  if (Array.isArray(json.suggestions)) {
    suggestionsRaw = JSON.stringify(json.suggestions);
  } else if (typeof json.suggestions === 'string') {
    suggestionsRaw = json.suggestions;
  }

  // Parse imageAnalyses
  const imageAnalyses: ImageAnalysis[] = [];
  if (Array.isArray(json.imageAnalyses)) {
    for (const item of json.imageAnalyses) {
      if (typeof item === 'object' && item !== null) {
        const analysis = item as Record<string, unknown>;
        if (typeof analysis.fileName === 'string' && typeof analysis.analysis === 'string') {
          imageAnalyses.push({
            fileName: analysis.fileName,
            analysis: analysis.analysis,
          });
        }
      }
    }
  }

  return {
    message: finalMessage,
    suggestions: parseAndFinalizeSuggestions(suggestionsRaw, finalMessage),
    imageAnalyses,
  };
}

function buildStructuredReplyMessages(
  messages: Array<{ role: string; content: string | Array<unknown> }>,
  hasTools: boolean = false,
  hasImages: boolean = false,
  env?: Env
): Array<{
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}> {
  // For images with GLM-4.6v, use simpler format
  // GLM-4.6v is sensitive to complex prompts with images
  if (hasImages) {
    const baseSystemPrompt = env?.CHAT_SYSTEM_PROMPT || 'You are a helpful assistant.';
    const simpleInstruction = `${baseSystemPrompt}

Please analyze the provided image and respond in a helpful manner. Focus on describing what you see in the image.`;

    const normalized = messages.flatMap(
      (
        item
      ): Array<{
        role: 'system' | 'user' | 'assistant';
        content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
      }> => {
        const role = item.role === 'assistant' || item.role === 'system' ? item.role : 'user';

        if (Array.isArray(item.content)) {
          if (!item.content || item.content.length === 0) return [];
          return [
            {
              role,
              content: item.content as Array<{
                type: string;
                text?: string;
                image_url?: { url: string };
              }>,
            },
          ];
        } else {
          const content = item.content?.trim();
          if (!content) return [];
          return [{ role, content }];
        }
      }
    );

    // Prepend simple instruction to first user message with images
    const firstUserMsgIndex = normalized.findIndex(
      (msg) => msg.role === 'user' && Array.isArray(msg.content)
    );
    if (firstUserMsgIndex >= 0) {
      const firstUserMsg = normalized[firstUserMsgIndex];
      const contentArray = firstUserMsg.content as Array<{
        type: string;
        text?: string;
        image_url?: { url: string };
      }>;
      const textElement = contentArray.find((item) => item.type === 'text');
      if (textElement && textElement.text) {
        textElement.text = `${simpleInstruction}\n\n${textElement.text}`;
      } else {
        contentArray.push({ type: 'text', text: simpleInstruction });
      }
    }
    return normalized;
  }

  // For non-image messages, use the original structured reply format
  const baseSystemPrompt = env?.CHAT_SYSTEM_PROMPT || 'You are a helpful assistant.';

  let systemInstruction = `${baseSystemPrompt}

IMPORTANT: You must respond with a valid JSON object only. No markdown, no code blocks, no additional text.

JSON format:
{
  "message": "Your response to the user",
  "suggestions": ["question 1", "question 2", "question 3"]
}

Rules:
- Return ONLY the JSON object, nothing else
- suggestions: exactly 3 relevant follow-up questions`;

  if (hasTools) {
    systemInstruction += `

Available Tools:
- webSearchPrime: Search the internet for latest news, current events, and real-time information. Use this when users ask about news, recent events, or time-sensitive topics.
- webReader: Read and analyze web page content. Use this when users provide a URL or ask about a specific website.

IMPORTANT: When users ask for news, current events, or real-time information, you MUST use the webSearchPrime tool to fetch accurate, up-to-date information. Do not claim you cannot access the internet.`;
  }

  const normalized = messages.flatMap(
    (
      item
    ): Array<{
      role: 'system' | 'user' | 'assistant';
      content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }> => {
      const role = item.role === 'assistant' || item.role === 'system' ? item.role : 'user';

      // Preserve array content format (for images), convert others to string
      if (Array.isArray(item.content)) {
        // Keep array format for images
        if (!item.content || item.content.length === 0) return [];
        return [
          {
            role,
            content: item.content as Array<{
              type: string;
              text?: string;
              image_url?: { url: string };
            }>,
          },
        ];
      } else {
        const content = item.content?.trim();
        if (!content) return [];
        return [{ role, content }];
      }
    }
  );

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
    choice0ReasoningContentPreview: truncateText(
      extractTextFromUnknown(message0?.reasoning_content),
      200
    ),
    choice0TextPreview: truncateText(extractTextFromUnknown(choice0?.text), 200),
    outputTextPreview: truncateText(extractTextFromUnknown(payload.output_text), 200),
    outputPreview: truncateText(extractTextFromUnknown(payload.output), 200),
  };
}

function buildNonStreamingChatCompletionParams(params: {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }>;
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

async function _probeModelHealth(
  openai: OpenAI,
  modelName: string,
  traceId: string,
  env?: Env
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
        env,
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

chat.get(
  '/conversations/:id',
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
    return c.json({ success: true, data: { conversation, messages } });
  }
);

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

chat.delete(
  '/conversations/:id',
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

    await deleteConversation(db, id);
    return c.json({ success: true, data: { message: 'Conversation deleted' } });
  }
);

chat.post('/respond', zValidator('json', chatRequestSchema, validationErrorHook), async (c) => {
  const traceId = generateId();
  c.header('X-Trace-Id', traceId);

  const { userId } = getAuthInfo(c);
  const { conversationId, message, files, model: requestedModel } = c.req.valid('json');
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

  const model =
    requestedModel ||
    detectVisionModel(
      [
        ...historyForModelDetection.map((msg) => ({
          role: msg.role,
          content: msg.message,
          files: msg.files || undefined,
        })),
        { role: 'user', content: message, files },
      ],
      c.env
    ) ||
    c.env.OPENROUTER_CHAT_MODEL ||
    'gpt-5.3-codex';

  // Process files: upload images to R2 and get public URLs
  // GLM-4.6v requires HTTP(S) URLs, not base64 dataURLs
  // We use R2's public access URL (r2.dev) for this
  let processedFiles = files;
  if (files && files.length > 0) {
    processedFiles = await Promise.all(
      files.map(async (file) => {
        // Images: upload to R2 and get public URL
        if (file.mimeType.startsWith('image/') && file.url.startsWith('data:')) {
          try {
            // Parse dataURL
            const matches = file.url.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              const mimeType = matches[1];
              const base64Data = matches[2];
              const buffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

              // Generate file key and upload to R2
              let ext = 'bin';
              if (mimeType === 'image/jpeg') ext = 'jpg';
              else if (mimeType === 'image/png') ext = 'png';
              else if (mimeType === 'image/gif') ext = 'gif';
              else if (mimeType === 'image/webp') ext = 'webp';

              const key = `uploads/${userId}/${generateId()}.${ext}`;

              await c.env.BUCKET.put(key, buffer, {
                httpMetadata: { contentType: mimeType },
              });

              // Use R2 public URL (r2.dev) for GLM-4.6v access
              const publicUrl = `https://pub-dc5339e22e694b328a07160c88c3cd64.r2.dev/${key}`;

              return {
                ...file,
                url: publicUrl,
              };
            }
          } catch (error) {
            throw new Error(
              `Image upload to R2 failed. GLM-4.6v requires HTTP URLs. Original error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              { cause: error }
            );
          }
        }
        // PDFs, Office documents and other files keep original URL
        return file;
      })
    );
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

  // Convert legacy image URLs to R2.dev public URLs for GLM-4.6v compatibility
  // Legacy format: https://chat.3we.org/file/download/{key}
  // New format: https://pub-dc5339e22e694b328a07160c88c3cd64.r2.dev/{key}
  const R2_DEV_PUBLIC_URL = 'https://pub-dc5339e22e694b328a07160c88c3cd64.r2.dev';
  const LEGACY_DOWNLOAD_PATTERN = /^https:\/\/chat\.3we\.org\/file\/download\/(.+)$/;

  function convertImageUrl(url: string): string {
    // Convert legacy download URLs to R2.dev public URLs
    const match = url.match(LEGACY_DOWNLOAD_PATTERN);
    if (match) {
      const key = match[1];
      return `${R2_DEV_PUBLIC_URL}/${key}`;
    }
    return url;
  }

  const openAiMessages: Array<{ role: string; content: string | Array<unknown> }> = [];
  for (const msg of history) {
    if (msg.role === 'user') {
      if (msg.files && msg.files.length > 0) {
        const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
          { type: 'text', text: msg.message },
        ];

        // Process files
        for (const file of msg.files) {
          if (file.mimeType.startsWith('image/')) {
            // Convert legacy URLs to R2.dev public URLs
            const imageUrl = convertImageUrl(file.url);
            content.push({ type: 'image_url', image_url: { url: imageUrl } });
          } else if (file.mimeType === 'application/pdf') {
            // PDF: always use extracted text (browser-side parsing)
            // If no text was extracted, add a placeholder
            if ('extractedText' in file && file.extractedText) {
              content[0].text += `\n\n--- File: ${file.fileName} ---\n${file.extractedText}`;
            } else {
              // PDF text extraction failed - add warning instead of using vision model
              content[0].text += `\n\n--- File: ${file.fileName} ---\n[PDF text extraction failed]`;
            }
          } else if (isOfficeFile(file)) {
            // Office documents: check if we have extracted text
            if ('extractedText' in file && file.extractedText) {
              // Use extracted text content
              content[0].text += `\n\n--- File: ${file.fileName} ---\n${file.extractedText}`;
            }
            // Do NOT fall back to reading as dataURL for binary Office files
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
      // Assistant message
      let assistantContent = msg.message;

      // If the assistant message has imageAnalyses, inject them into the content for future context
      if (
        (msg as Record<string, unknown>).imageAnalyses &&
        Array.isArray((msg as Record<string, unknown>).imageAnalyses)
      ) {
        const imageAnalyses = (msg as Record<string, unknown>).imageAnalyses as ImageAnalysis[];
        if (imageAnalyses.length > 0) {
          const analysisText = imageAnalyses
            .map((a) => `\n--- Image Analysis: ${a.fileName} ---\n${a.analysis}`)
            .join('\n');
          assistantContent += `\n\n${analysisText}`;
        }
      }

      openAiMessages.push({ role: 'assistant', content: assistantContent });
    }
  }

  const openai = new OpenAI({
    apiKey: c.env.OPENROUTER_API_KEY,
    baseURL: c.env.OPENROUTER_BASE_URL,
  });
  const candidates = Array.from(
    new Set([model, c.env.OPENROUTER_FALLBACK_MODEL?.trim()].filter((v): v is string => Boolean(v)))
  );

  // Initialize MCPAgent
  const agentId = c.env.MCPAgent.idFromName('global-mcp');
  const mcpAgentStub = c.env.MCPAgent.get(agentId);

  // Get tools if MCP is configured
  // The Agent SDK's getAITools() returns an AI SDK ToolSet (record format)
  // We'll use the actual tool execution but keep the tool definitions static for OpenAI compatibility
  const mcpTools =
    mcpAgentStub && (await mcpAgentStub.isConfigured())
      ? [
          {
            type: 'function' as const,
            function: {
              name: 'webSearchPrime',
              description:
                '搜索互联网以获取最新信息、新闻、实时数据。当用户询问当前事件、最新资讯、时效性问题时使用此工具。',
              parameters: {
                type: 'object',
                properties: {
                  search_query: {
                    type: 'string',
                    description: '搜索关键词或问题',
                  },
                  location: {
                    type: 'string',
                    description: '搜索区域 (cn/us)',
                    default: 'cn',
                  },
                  search_recency_filter: {
                    type: 'string',
                    description: '时间过滤 (noLimit/oneDay/threeDays/oneWeek)',
                    default: 'noLimit',
                  },
                  content_size: {
                    type: 'string',
                    description: '内容大小 (medium/high)',
                    default: 'medium',
                  },
                },
                required: ['search_query'] as string[],
              },
            },
          },
          {
            type: 'function' as const,
            function: {
              name: 'webReader',
              description: '读取指定网页的内容。当用户提供 URL 或要求分析某个网页时使用此工具。',
              parameters: {
                type: 'object',
                properties: {
                  url: {
                    type: 'string',
                    description: '要读取的网页 URL',
                  },
                  return_format: {
                    type: 'string',
                    description: '返回格式 (markdown/text)',
                    default: 'markdown',
                  },
                },
                required: ['url'] as string[],
              },
            },
          },
        ]
      : undefined;

  let activeModel = candidates[0] || model;
  let answerText = '';
  let bundledSuggestions: string[] = [];
  let parsedImageAnalyses: ImageAnalysis[] = [];
  const attemptLogs: Array<{ model: string; error?: ModelErrorDetail }> = [];

  // Build messages for LLM call
  const hasMcpTools = mcpAgentStub && (await mcpAgentStub.isConfigured());

  // Detect if current message contains images
  const hasImages = historyForModelDetection.some(
    (msg) => msg.role === 'user' && msg.files?.some((f) => f.mimeType.startsWith('image/'))
  );

  // Vision model doesn't support json_object format
  const isVisionModel = model.includes('vision') || model.includes('v');
  const responseFormat: ResponseFormat =
    hasImages || isVisionModel || mcpTools ? 'text' : 'json_object';

  const llmMessages = buildStructuredReplyMessages(openAiMessages, hasMcpTools, hasImages, c.env);
  const enhancedMessages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    tool_call_id?: string;
    tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
  }> = [...llmMessages];

  // First LLM call: Check if tools are needed
  // Note: When tools are present, we use 'text' format to allow function calling
  // GLM-4.7 cannot simultaneously return both tool_calls and json_object format
  // Vision models also don't support json_object format
  for (const candidate of candidates) {
    try {
      const completion = await withModelTimeout(
        () =>
          openai.chat.completions.create(
            buildNonStreamingChatCompletionParams({
              model: candidate,
              messages: enhancedMessages as Array<{
                role: 'system' | 'user' | 'assistant';
                content:
                  | string
                  | Array<{ type: string; text?: string; image_url?: { url: string } }>;
              }>,
              responseFormat,
              tools: mcpTools,
              tool_choice: mcpTools ? 'auto' : undefined,
              env: c.env,
            })
          ),
        MODEL_CALL_TIMEOUT_MS
      );

      // Check for tool calls
      const toolCalls = parseToolCalls(completion);

      if (toolCalls.length > 0 && mcpAgentStub && (await mcpAgentStub.isConfigured())) {
        // Execute tools via Agent
        const results: string[] = [];
        for (const toolCall of toolCalls) {
          const { name, arguments: args } = toolCall.function;
          const params = JSON.parse(args);
          const result = await mcpAgentStub.callTool(name, params);
          results.push(`【${name}】\n${result}`);
        }

        const toolResult = {
          success: true,
          results: results.join('\n\n'),
        };

        // Add assistant message with tool calls
        enhancedMessages.push({
          role: 'assistant',
          content: completion.choices[0]?.message?.content || undefined,
          tool_calls: completion.choices[0]?.message?.tool_calls || undefined,
        } as (typeof enhancedMessages)[number]);

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
                messages: enhancedMessages as Array<{
                  role: 'system' | 'user' | 'assistant';
                  content:
                    | string
                    | Array<{ type: string; text?: string; image_url?: { url: string } }>;
                }>,
                responseFormat: 'json_object',
                env: c.env,
              })
            ),
          MODEL_CALL_TIMEOUT_MS
        );

        const text = parseCompletionText(finalCompletion);
        const structured = parseStructuredReply(text);
        if (structured) {
          answerText = structured.message;
          bundledSuggestions = structured.suggestions;
          parsedImageAnalyses = structured.imageAnalyses || [];
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
            env: c.env,
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
          parsedImageAnalyses = structured.imageAnalyses || [];
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
            env: c.env,
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
    return errorResponse(
      c,
      500,
      ERROR_CODES.MODEL_REQUEST_FAILED,
      `Model request failed. traceId=${traceId}`
    );
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
    imageAnalyses: parsedImageAnalyses.length > 0 ? parsedImageAnalyses : null,
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
      imageAnalyses: parsedImageAnalyses,
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
