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

// ============================================================================
// 模型配置类型定义
// ============================================================================

type ModelType = 'chat-primary' | 'chat-fallback' | 'image-primary' | 'image-fallback';

type ModelConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

/**
 * 获取模型配置
 * @param env - 环境变量
 * @param modelType - 模型类型
 * @returns 模型配置对象
 */
function getModelConfig(env: Env, modelType: ModelType): ModelConfig {
  const defaultBaseUrl = 'https://open.bigmodel.cn/api/coding/paas/v4';
  const defaultApiKey = env.OPENROUTER_API_KEY;

  switch (modelType) {
    case 'chat-primary':
      return {
        baseUrl: env.CHAT_PRIMARY_BASE_URL || defaultBaseUrl,
        model: env.CHAT_PRIMARY_MODEL || 'GLM-4.7',
        apiKey: env.CHAT_PRIMARY_API_KEY || defaultApiKey,
      };
    case 'chat-fallback':
      return {
        baseUrl: env.CHAT_FALLBACK_BASE_URL || defaultBaseUrl,
        model: env.CHAT_FALLBACK_MODEL || 'GLM-4.7-Flash',
        apiKey: env.CHAT_FALLBACK_API_KEY || defaultApiKey,
      };
    case 'image-primary':
      return {
        baseUrl: env.IMAGE_PRIMARY_BASE_URL || defaultBaseUrl,
        model: env.IMAGE_PRIMARY_MODEL || 'glm-4v-plus',
        apiKey: env.IMAGE_PRIMARY_API_KEY || defaultApiKey,
      };
    case 'image-fallback':
      return {
        baseUrl: env.IMAGE_FALLBACK_BASE_URL || defaultBaseUrl,
        model: env.IMAGE_FALLBACK_MODEL || 'glm-4.6v',
        apiKey: env.IMAGE_FALLBACK_API_KEY || defaultApiKey,
      };
  }
}

/**
 * 创建 OpenAI 客户端
 * @param config - 模型配置
 * @returns OpenAI 客户端实例
 */
function createOpenAIClient(config: ModelConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
}

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

// R2 configuration constants
const R2_DEV_PUBLIC_URL = 'https://pub-dc5339e22e694b328a07160c88c3cd64.r2.dev';
const LEGACY_DOWNLOAD_PATTERN = /^https:\/\/chat\.3we\.org\/file\/download\/(.+)$/;

// MIME type to file extension mapping
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

function isCodeFile(file: MessageFile): boolean {
  return CODE_EXTENSIONS.includes(getFileExtension(file.fileName));
}

function isOfficeFile(file: MessageFile): boolean {
  return OFFICE_EXTENSIONS.includes(getFileExtension(file.fileName));
}

/**
 * Convert legacy download URLs to R2.dev public URLs
 */
function convertLegacyImageUrl(url: string): string {
  const match = url.match(LEGACY_DOWNLOAD_PATTERN);
  if (match) {
    return `${R2_DEV_PUBLIC_URL}/${match[1]}`;
  }
  return url;
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  return MIME_TO_EXT[mimeType] || 'bin';
}

/**
 * Upload an image data URL to R2 and return the public URL
 * @param dataUrl - The data URL to upload
 * @param mimeType - The MIME type of the image
 * @param userId - User ID for path generation
 * @param bucket - R2 bucket instance
 * @returns Public R2 URL
 */
async function uploadImageToR2(
  dataUrl: string,
  mimeType: string,
  userId: string,
  bucket: R2Bucket
): Promise<string> {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid data URL format');
  }

  const base64Data = matches[2];
  const buffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const ext = getExtensionFromMimeType(mimeType);
  const key = `uploads/${userId}/${generateId()}.${ext}`;

  await bucket.put(key, buffer, {
    httpMetadata: { contentType: mimeType },
  });

  return `${R2_DEV_PUBLIC_URL}/${key}`;
}

/**
 * Process a single file: upload images to R2, keep other files as-is
 * @param file - The file to process
 * @param userId - User ID for R2 path
 * @param bucket - R2 bucket instance
 * @returns Processed file with updated URL
 */
async function processFile(
  file: MessageFile,
  userId: string,
  bucket: R2Bucket
): Promise<MessageFile> {
  if (!file.mimeType.startsWith('image/') || !file.url.startsWith('data:')) {
    return file;
  }

  try {
    const publicUrl = await uploadImageToR2(file.url, file.mimeType, userId, bucket);
    return { ...file, url: publicUrl };
  } catch (error) {
    throw new Error(
      `Image upload to R2 failed. GLM-4.6v requires HTTP URLs. Original error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error }
    );
  }
}

/**
 * Build OpenAI-compatible messages from database message history
 * @param history - Message history from database
 * @returns OpenAI-compatible messages array
 */
function buildOpenAIMessages(
  history: Array<{
    role: string;
    message: string;
    files?: MessageFile[] | null;
  }>
): Array<{ role: string; content: string | Array<unknown> }> {
  const messages: Array<{ role: string; content: string | Array<unknown> }> = [];

  for (const msg of history) {
    if (msg.role === 'user') {
      if (msg.files && msg.files.length > 0) {
        const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
          { type: 'text', text: msg.message },
        ];

        for (const file of msg.files) {
          if (file.mimeType.startsWith('image/')) {
            const imageUrl = convertLegacyImageUrl(file.url);
            content.push({ type: 'image_url', image_url: { url: imageUrl } });
          } else if (file.mimeType === 'application/pdf') {
            if ('extractedText' in file && file.extractedText) {
              content[0].text += `\n\n--- File: ${file.fileName} ---\n${file.extractedText}`;
            } else {
              content[0].text += `\n\n--- File: ${file.fileName} ---\n[PDF text extraction failed]`;
            }
          } else if (isOfficeFile(file)) {
            if ('extractedText' in file && file.extractedText) {
              content[0].text += `\n\n--- File: ${file.fileName} ---\n${file.extractedText}`;
            }
          } else if (isCodeFile(file)) {
            const fileContent = readFileContentFromDataURL(file.url);
            if (fileContent) {
              content[0].text += `\n\n--- File: ${file.fileName} ---\n${fileContent}`;
            }
          }
        }

        messages.push({ role: 'user', content });
      } else {
        messages.push({ role: 'user', content: msg.message });
      }
    } else {
      let assistantContent = msg.message;

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

      messages.push({ role: 'assistant', content: assistantContent });
    }
  }

  return messages;
}

/**
 * Build model candidates list for chat completion
 * @param env - Environment variables
 * @param requestedModel - User-specified model (optional)
 * @param isImageRequest - Whether image model is needed
 * @returns Array of model configurations
 */
function buildModelCandidates(
  env: Env,
  requestedModel: string | undefined,
  isImageRequest: boolean
): ModelConfig[] {
  if (requestedModel) {
    return [
      {
        baseUrl: env.CHAT_PRIMARY_BASE_URL,
        model: requestedModel,
        apiKey: env.OPENROUTER_API_KEY,
      },
    ];
  }

  const primaryConfig = getModelConfig(env, isImageRequest ? 'image-primary' : 'chat-primary');
  const fallbackConfig = getModelConfig(env, isImageRequest ? 'image-fallback' : 'chat-fallback');

  return [primaryConfig, fallbackConfig].filter((config) => config.model && config.baseUrl);
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

function findJsonObjectEnd(input: string, startIndex: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < input.length; i++) {
    const char = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth++;
      continue;
    }

    if (char === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
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
  const end = start === -1 ? -1 : findJsonObjectEnd(cleaned, start);

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

function parseStructuredReply(raw: string, languageHint: string): StructuredReply | null {
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
    suggestions: parseAndFinalizeSuggestions(suggestionsRaw, finalMessage, languageHint),
    imageAnalyses,
  };
}

function buildStructuredReplyMessages(
  messages: Array<{ role: string; content: string | Array<unknown> }>,
  hasTools: boolean = false,
  hasImages: boolean = false,
  env?: Env,
  languageHint?: string
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

  // Normalize messages (needed for both tool and non-tool paths)
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

  // When tools are available, prioritize tool calling over JSON response format
  // GLM-4.7 cannot simultaneously support both tool_calls and json_object format
  if (hasTools) {
    let systemInstruction = `${baseSystemPrompt}

Available Tools:
You have access to web search and page reading tools. When users ask for news, current events, or real-time information, you MUST use the available search tools to fetch accurate, up-to-date information. Do not claim you cannot access the internet.

IMPORTANT: Always use the provided tools when users ask for current events, news, or specific web page content.

Response Format:
After using tools (if needed), provide your response in plain text. Be direct and helpful.`;

    if (languageHint) {
      systemInstruction += `

Please respond in the same language as the user's question. The user asked in: ${truncateText(languageHint, 200)}`;
    }

    return [{ role: 'system', content: systemInstruction }, ...normalized];
  }

  // No tools: use JSON response format
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

  if (languageHint) {
    systemInstruction += `
- suggestions language: must match the user's latest question language

Latest user question:
${truncateText(languageHint, 200)}`;
  }

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
  env?: Env;
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
    // Log the tools being sent to the API for debugging
    console.warn('API request with tools', {
      model,
      toolCount: tools.length,
      toolChoice: tool_choice,
      tools: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    });
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

  // Detect if image model is needed
  const hasImages = files?.some((f) => f.mimeType.startsWith('image/')) ?? false;
  const hasHistoryImages = historyForModelDetection.some(
    (msg) => msg.role === 'user' && msg.files?.some((f) => f.mimeType.startsWith('image/'))
  );
  const isImageRequest = hasImages || hasHistoryImages;

  // Build model candidates list
  const modelCandidates = buildModelCandidates(c.env, requestedModel, isImageRequest);

  // 用于日志的模型名称
  const primaryModelName = modelCandidates[0]?.model || 'unknown';

  // Process files: upload images to R2 and get public URLs
  const processedFiles =
    files && files.length > 0
      ? await Promise.all(files.map((file) => processFile(file, userId, c.env.BUCKET)))
      : files;

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
  const openAiMessages = buildOpenAIMessages(history);

  // Initialize MCPAgent
  const agentId = c.env.MCPAgent.idFromName('global-mcp');
  const mcpAgentStub = c.env.MCPAgent.get(agentId);

  // Get tools if MCP is configured
  // Dynamically fetch tool definitions from MCP server to ensure names match
  let mcpTools:
    | Array<{
        type: 'function';
        function: {
          name: string;
          description: string;
          parameters: Record<string, unknown>;
        };
      }>
    | undefined = undefined;

  if (mcpAgentStub && (await mcpAgentStub.isConfigured())) {
    try {
      // @ts-expect-error - Cloudflare Agent SDK getAITools() causes deep type instantiation
      const rawTools = (await mcpAgentStub.getAITools()) as Record<
        string,
        { description?: string; inputSchema?: unknown } | undefined
      > | null;

      // Convert Agent SDK tool format to OpenAI function calling format
      // Agent SDK returns: Record<string, {description: string, inputSchema: object}>
      if (rawTools && typeof rawTools === 'object') {
        mcpTools = Object.entries(rawTools).map(([name, toolDef]) => {
          const def = toolDef as { description?: string; inputSchema?: unknown } | undefined;
          return {
            type: 'function' as const,
            function: {
              name,
              description: def?.description || `Tool: ${name}`,
              parameters: (def?.inputSchema as Record<string, unknown>) || {
                type: 'object',
                properties: {},
              },
            },
          };
        });

        console.warn('MCP tools loaded', {
          traceId,
          toolCount: mcpTools.length,
          toolNames: mcpTools.map((t) => t.function.name),
        });
      }
    } catch (mcpToolsError) {
      console.error('Failed to load MCP tools', {
        traceId,
        error: mcpToolsError instanceof Error ? mcpToolsError.message : 'Unknown error',
      });
      // Continue without tools
      mcpTools = undefined;
    }
  }

  let activeModel = modelCandidates[0]?.model || 'unknown';
  let activeBaseUrl = modelCandidates[0]?.baseUrl || 'unknown';
  let answerText = '';
  let bundledSuggestions: string[] = [];
  let parsedImageAnalyses: ImageAnalysis[] = [];
  const attemptLogs: Array<{ model: string; baseUrl?: string; error?: ModelErrorDetail }> = [];

  // Build messages for LLM call
  const hasMcpTools = mcpAgentStub && (await mcpAgentStub.isConfigured());

  // Vision model doesn't support json_object format
  const isVisionModel = primaryModelName.includes('vision') || primaryModelName.includes('v');
  const responseFormat: ResponseFormat =
    isImageRequest || isVisionModel || mcpTools ? 'text' : 'json_object';

  const llmMessages = buildStructuredReplyMessages(
    openAiMessages,
    hasMcpTools,
    isImageRequest,
    c.env,
    message
  );
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
  for (const candidateConfig of modelCandidates) {
    try {
      // 为每个候选模型创建独立的 OpenAI 客户端
      const openai = createOpenAIClient(candidateConfig);
      const candidateModel = candidateConfig.model;

      const completion = await withModelTimeout(
        () =>
          openai.chat.completions.create(
            buildNonStreamingChatCompletionParams({
              model: candidateModel,
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
      // Log completion structure for debugging
      const messageContent = completion.choices[0]?.message;
      console.warn('Completion analysis', {
        traceId,
        hasMessage: !!messageContent,
        hasToolCalls: !!messageContent?.tool_calls,
        toolCallsCount: messageContent?.tool_calls?.length || 0,
        hasContent: !!messageContent?.content,
        contentPreview: messageContent?.content?.substring(0, 200),
        toolCalls: messageContent?.tool_calls,
      });

      const toolCalls = parseToolCalls(completion);

      if (toolCalls.length > 0 && mcpAgentStub && (await mcpAgentStub.isConfigured())) {
        // Execute tools via Agent
        const results: string[] = [];

        for (const toolCall of toolCalls) {
          const { name, arguments: args } = toolCall.function;
          let params: Record<string, unknown>;

          // Parse tool arguments with error handling
          try {
            params = JSON.parse(args);
          } catch (parseError) {
            console.error('MCP tool JSON parse error', {
              traceId,
              toolCallId: toolCall.id,
              toolName: name,
              args,
              error: parseError instanceof Error ? parseError.message : 'Unknown error',
            });
            results.push(`【${name}】\n工具参数解析失败，请重试。`);
            continue;
          }

          // Execute tool with error handling
          try {
            console.warn('MCP tool execution started', {
              traceId,
              toolName: name,
            });
            const result = await mcpAgentStub.callTool(name, params);
            results.push(`【${name}】\n${result}`);
            console.warn('MCP tool execution succeeded', {
              traceId,
              toolName: name,
              resultLength: result.length,
            });
          } catch (toolError) {
            console.error('MCP tool execution failed', {
              traceId,
              toolName: name,
              error: {
                message: toolError instanceof Error ? toolError.message : 'Unknown error',
                stack: toolError instanceof Error ? toolError.stack : undefined,
              },
            });
            results.push(
              `【${name}】\n工具执行失败：${toolError instanceof Error ? toolError.message : '未知错误'}`
            );
          }
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
        // Rebuild messages WITHOUT tool instructions to avoid format confusion
        const finalMessages = buildStructuredReplyMessages(
          openAiMessages,
          false, // No tools in second call
          isImageRequest,
          c.env,
          message
        );

        // Add the assistant message with tool calls and tool results
        finalMessages.push({
          role: 'assistant',
          content: completion.choices[0]?.message?.content || undefined,
        } as (typeof finalMessages)[number]);

        finalMessages.push({
          role: 'user',
          content: `Tool results:\n${toolResult.results}\n\nPlease provide your response based on these tool results.`,
        });

        const finalCompletion = await withModelTimeout(
          () =>
            openai.chat.completions.create(
              buildNonStreamingChatCompletionParams({
                model: candidateModel,
                messages: finalMessages as Array<{
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
        const structured = parseStructuredReply(text, message);
        if (structured) {
          answerText = structured.message;
          bundledSuggestions = structured.suggestions;
          parsedImageAnalyses = structured.imageAnalyses || [];
          activeModel = candidateModel;
          activeBaseUrl = candidateConfig.baseUrl;
          break;
        }
        // Fallback: if structured parsing fails, use the text directly
        if (text) {
          answerText = text;
          // Generate simple suggestions for tool-based responses
          bundledSuggestions = await generateFollowUpSuggestions({
            openai,
            model: candidateModel,
            answerText: text,
            userMessage: message,
            env: c.env,
          });
          activeModel = candidateModel;
          activeBaseUrl = candidateConfig.baseUrl;
          break;
        }
      } else {
        // No tools needed, use original completion
        // When mcpTools were provided but no tools were called, the response is plain text
        // When no mcpTools were provided, the response is structured JSON
        const text = parseCompletionText(completion);
        const structured = parseStructuredReply(text, message);
        if (structured) {
          // Structured reply (no tools were configured)
          answerText = structured.message;
          bundledSuggestions = structured.suggestions;
          parsedImageAnalyses = structured.imageAnalyses || [];
          activeModel = candidateModel;
          activeBaseUrl = candidateConfig.baseUrl;
          break;
        }
        // Fallback: if tools were configured but not called, use plain text
        if (text && mcpTools) {
          answerText = text;
          // Generate simple suggestions for tool-based responses
          bundledSuggestions = await generateFollowUpSuggestions({
            openai,
            model: candidateModel,
            answerText: text,
            userMessage: message,
            env: c.env,
          });
          activeModel = candidateModel;
          activeBaseUrl = candidateConfig.baseUrl;
          break;
        }
      }

      attemptLogs.push({
        model: candidateModel,
        baseUrl: candidateConfig.baseUrl,
        error: {
          name: 'InvalidStructuredReplyError',
          message: 'Model returned completion without parseable structured reply',
          body: summarizeCompletionPayload(completion),
        },
      });
    } catch (error) {
      attemptLogs.push({
        model: candidateConfig.model,
        baseUrl: candidateConfig.baseUrl,
        error: toModelErrorDetail(error),
      });
    }
    if (answerText.trim()) break;
  }

  if (!answerText.trim()) {
    console.error('chat_respond_failed', {
      traceId,
      userId,
      conversationId,
      primaryModel: primaryModelName,
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
      baseUrl: activeBaseUrl,
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
