import { Agent, callable, type Connection, type ConnectionContext } from 'agents';
import OpenAI from 'openai';
import type { Env } from '../store-context';
import { createDb } from '../db';
import { createMessage, getRecentMessages } from '../dao/messages';
import { updateConversation } from '../dao/conversations';
import { generateId } from '../utils/crypto';
import { parseToolCalls } from '../mcp/parser';
import { parseAndFinalizeSuggestions, generateFollowUpSuggestions } from '../utils/suggestions';
import type { ChatAgentState, SendMessageParams, SendMessageResult, ToolInfo, ToolRun } from '@chatwithme/shared';

// ============================================================================
// Constants
// ============================================================================

const IDLE_TIMEOUT_SECONDS = 15 * 60;
const IDLE_CALLBACK = 'onIdleTimeout';
const MODEL_CALL_TIMEOUT_MS = 120_000;

// ============================================================================
// Helper Types
// ============================================================================

type ModelConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

type ResponseFormat = 'text' | 'json_object';

type StructuredReply = {
  message: string;
  suggestions: string[];
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build model candidates list for chat completion (simplified - no image models)
 */
function buildModelCandidates(env: Env, modelOverride?: string): ModelConfig[] {
  const defaultApiKey = env.OPENROUTER_API_KEY;

  if (modelOverride) {
    return [
      {
        baseUrl: env.CHAT_PRIMARY_BASE_URL,
        model: modelOverride,
        apiKey: env.CHAT_PRIMARY_API_KEY || defaultApiKey,
      },
    ];
  }

  const candidates: ModelConfig[] = [];

  // Primary chat model
  if (env.CHAT_PRIMARY_MODEL && env.CHAT_PRIMARY_BASE_URL) {
    candidates.push({
      baseUrl: env.CHAT_PRIMARY_BASE_URL,
      model: env.CHAT_PRIMARY_MODEL,
      apiKey: env.CHAT_PRIMARY_API_KEY || defaultApiKey,
    });
  }

  // Fallback chat model
  if (env.CHAT_FALLBACK_MODEL && env.CHAT_FALLBACK_BASE_URL) {
    candidates.push({
      baseUrl: env.CHAT_FALLBACK_BASE_URL,
      model: env.CHAT_FALLBACK_MODEL,
      apiKey: env.CHAT_FALLBACK_API_KEY || defaultApiKey,
    });
  }

  return candidates;
}

/**
 * Create OpenAI client from config
 */
function createOpenAIClient(config: ModelConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
}

/**
 * Execute task with timeout
 */
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

/**
 * Truncate text for logging
 */
function truncateText(value: string, max = 500): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

/**
 * Extract text from unknown completion payload
 */
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

/**
 * Parse completion text from various response formats
 */
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

  const finalMessage = remaining ? `${message}\n\n${remaining}` : message;

  let suggestionsRaw = '';
  if (Array.isArray(json.suggestions)) {
    suggestionsRaw = JSON.stringify(json.suggestions);
  } else if (typeof json.suggestions === 'string') {
    suggestionsRaw = json.suggestions;
  }

  return {
    message: finalMessage,
    suggestions: parseAndFinalizeSuggestions(suggestionsRaw, finalMessage, languageHint),
  };
}

/**
 * Build OpenAI-compatible messages from database message history
 */
function buildOpenAIMessages(
  history: Array<{
    role: string;
    message: string;
    files?: Array<{ mimeType: string; url: string; fileName: string; extractedText?: string }> | null;
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
            content.push({ type: 'image_url', image_url: { url: file.url } });
          } else if (file.mimeType === 'application/pdf' && file.extractedText) {
            content[0].text += `\n\n--- File: ${file.fileName} ---\n${file.extractedText}`;
          }
        }

        messages.push({ role: 'user', content });
      } else {
        messages.push({ role: 'user', content: msg.message });
      }
    } else {
      messages.push({ role: 'assistant', content: msg.message });
    }
  }

  return messages;
}

/**
 * Build messages for structured reply format
 */
function buildStructuredReplyMessages(
  messages: Array<{ role: string; content: string | Array<unknown> }>,
  hasTools: boolean = false,
  env?: Env,
  languageHint?: string
): Array<{
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}> {
  const baseSystemPrompt = env?.CHAT_SYSTEM_PROMPT || 'You are a helpful assistant.';

  // Normalize messages
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

  // When tools are available, use plain text format
  if (hasTools) {
    let systemInstruction = `${baseSystemPrompt}

Available Tools:
You have access to web search and page reading tools. When users ask for news, current events, or real-time information, you MUST use the available search tools to fetch accurate, up-to-date information.

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

/**
 * Build non-streaming chat completion params
 */
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
  const { model, messages, responseFormat = 'text', maxTokens, tools, tool_choice, env } = params;

  const payload: Record<string, unknown> = {
    model,
    messages,
    stream: false,
  };

  // Configure thinking based on environment variable (default: disabled)
  if (env?.CHAT_THINKING_ENABLED !== undefined) {
    const thinkingEnabled =
      env.CHAT_THINKING_ENABLED === 'true' || env.CHAT_THINKING_ENABLED === '1';
    payload.thinking = { type: thinkingEnabled ? 'enabled' : 'disabled' };
  } else {
    payload.thinking = { type: 'disabled' };
  }

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

// ============================================================================
// ChatAgent Class
// ============================================================================

/**
 * ChatAgent - Manages chat conversations with MCP tool support
 *
 * Responsibilities:
 * 1. Manage conversation state and message history
 * 2. Execute LLM calls with fallback support
 * 3. Execute MCP tools and track their status
 * 4. Stream UI blocks to connected clients
 * 5. Handle idle timeout and cleanup
 */
export class ChatAgent extends Agent<Env, ChatAgentState> {
  // Initial state
  initialState: ChatAgentState = {
    conversationId: null,
    userId: null,
    messages: [],
    toolRuns: {},
    uiBlocks: [],
    status: 'idle',
    activeModel: null,
    lastError: null,
    traceId: null,
  };

  // ============================================================================
  // Lifecycle Hooks
  // ============================================================================

  /**
   * Agent startup - initialize MCP connections
   */
  async onStart(): Promise<void> {
    console.warn('ChatAgent: Starting', { name: this.name });
    await this.ensureMcpConnections();
  }

  /**
   * Connection established - cancel idle timeout
   */
  onConnect(_connection: Connection, _ctx: ConnectionContext): void {
    console.warn('ChatAgent: Client connected', { name: this.name });

    // Cancel any pending idle timeout on reconnect
    for (const schedule of this.getSchedules()) {
      if (schedule.callback === IDLE_CALLBACK) {
        this.cancelSchedule(schedule.id);
      }
    }
  }

  /**
   * Connection closed - schedule idle timeout if no connections remain
   */
  onClose(_connection: Connection): void {
    const remaining = [...this.getConnections()].length;
    console.warn('ChatAgent: Client disconnected', { name: this.name, remaining });

    if (remaining === 0) {
      // Schedule self-destruct after 15 minutes of no connections
      this.schedule(IDLE_TIMEOUT_SECONDS, IDLE_CALLBACK, {});
    }
  }

  /**
   * Idle timeout - destroy agent if no connections
   */
  async onIdleTimeout(): Promise<void> {
    const remaining = [...this.getConnections()].length;
    console.warn('ChatAgent: Idle timeout check', { name: this.name, remaining });

    if (remaining === 0) {
      console.warn('ChatAgent: Destroying due to inactivity', { name: this.name });
      await this.destroy();
    }
  }

  /**
   * State update callback - for logging
   */
  onStateUpdate(state: ChatAgentState, _source: unknown): void {
    console.warn('ChatAgent: State updated', {
      name: this.name,
      status: state.status,
      messageCount: state.messages.length,
      toolRunCount: Object.keys(state.toolRuns).length,
    });
  }

  // ============================================================================
  // MCP Connection Management
  // ============================================================================

  /**
   * Ensure MCP connections are established
   */
  private async ensureMcpConnections(): Promise<void> {
    const apiKey = this.env.BIGMODEL_API_KEY || this.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      console.warn('ChatAgent: No API key configured for MCP');
      return;
    }

    const services = [
      {
        key: 'web_search',
        url: this.env.MCP_WEB_SEARCH_URL || 'https://open.bigmodel.cn/api/mcp/web_search_prime/mcp',
      },
      {
        key: 'web_reader',
        url: this.env.MCP_WEB_READER_URL || 'https://open.bigmodel.cn/api/mcp/web_reader/mcp',
      },
    ];

    try {
      for (const service of services) {
        try {
          await this.mcp.connect(service.url, {
            transport: {
              type: 'streamable-http',
              requestInit: {
                headers: { Authorization: `Bearer ${apiKey}` },
              },
            },
          });
          console.warn('ChatAgent: MCP service connected', { service: service.key });
        } catch (error) {
          console.error('ChatAgent: Failed to connect MCP service', {
            service: service.key,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } catch (error) {
      console.error('ChatAgent: MCP connection error', error);
    }
  }

  /**
   * Check if MCP is configured
   */
  private isMcpConfigured(): boolean {
    const apiKey = this.env.BIGMODEL_API_KEY || this.env.OPENROUTER_API_KEY;
    return Boolean(apiKey);
  }

  /**
   * Get AI SDK compatible tools from MCP
   */
  private async getMcpTools(): Promise<OpenAI.Chat.ChatCompletionTool[] | undefined> {
    if (!this.isMcpConfigured()) return undefined;

    try {
      const rawTools = (await this.mcp.getAITools()) as Record<
        string,
        { description?: string; inputSchema?: unknown } | undefined
      > | null;

      if (rawTools && typeof rawTools === 'object') {
        return Object.entries(rawTools).map(([name, toolDef]) => {
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
      }
    } catch (error) {
      console.error('ChatAgent: Failed to get MCP tools', error);
    }

    return undefined;
  }

  /**
   * Execute a tool call via MCP
   */
  private async executeToolCall(
    toolName: string,
    args: Record<string, unknown>,
    traceId: string
  ): Promise<string> {
    const toolRunId = generateId();

    // Create pending tool run
    const pendingRun: ToolRun = {
      id: toolRunId,
      toolName,
      arguments: args,
      status: 'running',
      startedAt: Date.now(),
    };

    this.setState({
      ...this.state,
      status: 'executing_tools',
      toolRuns: {
        ...this.state.toolRuns,
        [toolRunId]: pendingRun,
      },
    });

    try {
      console.warn('ChatAgent: Executing tool', { traceId, toolName });

      const tools = this.mcp.listTools();
      const tool = tools.find(
        (t) =>
          t.name === toolName ||
          t.name.toLowerCase() === toolName.toLowerCase() ||
          t.name.toLowerCase().replace(/_/g, '').includes(toolName.toLowerCase())
      );

      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      const result = await this.mcp.callTool({
        serverId: tool.serverId,
        name: toolName,
        arguments: args,
      });

      const formattedResult = this.formatToolResult(result);

      // Update to success
      this.setState({
        ...this.state,
        toolRuns: {
          ...this.state.toolRuns,
          [toolRunId]: {
            ...pendingRun,
            status: 'success',
            result: formattedResult,
            completedAt: Date.now(),
          },
        },
      });

      console.warn('ChatAgent: Tool execution succeeded', {
        traceId,
        toolName,
        resultLength: formattedResult.length,
      });

      return formattedResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update to error
      this.setState({
        ...this.state,
        toolRuns: {
          ...this.state.toolRuns,
          [toolRunId]: {
            ...pendingRun,
            status: 'error',
            error: errorMessage,
            completedAt: Date.now(),
          },
        },
      });

      console.error('ChatAgent: Tool execution failed', {
        traceId,
        toolName,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Format tool result to string
   */
  private formatToolResult(result: unknown): string {
    const content = (result as { content?: unknown[] })?.content;
    if (!Array.isArray(content)) return JSON.stringify(result);

    const textChunks = content
      .filter((c) => c && typeof c === 'object' && 'type' in c && c.type === 'text')
      .map((c) => (c as { text: string }).text)
      .join('\n');

    return textChunks || JSON.stringify(result);
  }

  // ============================================================================
  // Callable Methods (RPC)
  // ============================================================================

  /**
   * Initialize conversation context
   */
  @callable()
  async initializeConversation(params: { conversationId: string; userId: string }): Promise<void> {
    console.warn('ChatAgent: Initializing conversation', params);

    this.setState({
      ...this.state,
      conversationId: params.conversationId,
      userId: params.userId,
      status: 'idle',
    });

    // Load existing messages from database
    const db = createDb(this.env.DB);
    const messages = await getRecentMessages(db, params.conversationId, 100);

    this.setState({
      ...this.state,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.message,
        createdAt: m.createdAt.getTime(),
      })),
    });
  }

  /**
   * Send a message and get a response
   */
  @callable()
  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const traceId = generateId();

    console.warn('ChatAgent: sendMessage', {
      traceId,
      conversationId: this.state.conversationId,
      messageLength: params.message.length,
    });

    if (!this.state.conversationId || !this.state.userId) {
      throw new Error('Conversation not initialized');
    }

    // Update state to thinking
    this.setState({
      ...this.state,
      status: 'thinking',
      traceId,
    });

    const db = createDb(this.env.DB);

    try {
      // Create user message in database
      const now = new Date();
      await createMessage(db, {
        id: generateId(),
        userId: this.state.userId,
        conversationId: this.state.conversationId,
        role: 'user',
        message: params.message,
        files: params.files ? JSON.parse(JSON.stringify(params.files)) : null,
        generatedImageUrls: null,
        searchResults: null,
        createdAt: now,
      });

      // Fetch message history
      const history = await getRecentMessages(db, this.state.conversationId, 20);
      const openAiMessages = buildOpenAIMessages(history);

      // Get MCP tools
      const mcpTools = await this.getMcpTools();
      const hasTools = mcpTools && mcpTools.length > 0;

      // Build messages for LLM
      const llmMessages = buildStructuredReplyMessages(
        openAiMessages,
        hasTools,
        this.env,
        params.message
      );

      // Build model candidates
      const modelCandidates = buildModelCandidates(this.env, params.modelOverride);

      let answerText = '';
      let bundledSuggestions: string[] = [];
      let activeModel = modelCandidates[0]?.model || 'unknown';

      // Try each model candidate
      for (const candidateConfig of modelCandidates) {
        try {
          const openai = createOpenAIClient(candidateConfig);
          const candidateModel = candidateConfig.model;

          // First LLM call
          const completion = await withModelTimeout(
            () =>
              openai.chat.completions.create(
                buildNonStreamingChatCompletionParams({
                  model: candidateModel,
                  messages: llmMessages as Array<{
                    role: 'system' | 'user' | 'assistant';
                    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
                  }>,
                  responseFormat: hasTools ? 'text' : 'json_object',
                  tools: mcpTools,
                  tool_choice: mcpTools ? 'auto' : undefined,
                  env: this.env,
                })
              ),
            MODEL_CALL_TIMEOUT_MS
          );

          // Check for tool calls
          const toolCalls = parseToolCalls(completion);

          if (toolCalls.length > 0 && hasTools) {
            // Execute tools
            const results: string[] = [];

            for (const toolCall of toolCalls) {
              const { name, arguments: args } = toolCall.function;
              let parsedArgs: Record<string, unknown>;

              try {
                parsedArgs = JSON.parse(args);
              } catch {
                results.push(`【${name}】\n工具参数解析失败，请重试。`);
                continue;
              }

              try {
                const result = await this.executeToolCall(name, parsedArgs, traceId);
                results.push(`【${name}】\n${result}`);
              } catch (error) {
                results.push(
                  `【${name}】\n工具执行失败：${error instanceof Error ? error.message : '未知错误'}`
                );
              }
            }

            // Second LLM call with tool results
            const finalMessages = buildStructuredReplyMessages(
              openAiMessages,
              false, // No tools in second call
              this.env,
              params.message
            );

            finalMessages.push({
              role: 'assistant',
              content: completion.choices[0]?.message?.content || undefined,
            } as (typeof finalMessages)[number]);

            finalMessages.push({
              role: 'user',
              content: `Tool results:\n${results.join('\n\n')}\n\nPlease provide your response based on these tool results.`,
            });

            const finalCompletion = await withModelTimeout(
              () =>
                openai.chat.completions.create(
                  buildNonStreamingChatCompletionParams({
                    model: candidateModel,
                    messages: finalMessages as Array<{
                      role: 'system' | 'user' | 'assistant';
                      content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
                    }>,
                    responseFormat: 'json_object',
                    env: this.env,
                  })
                ),
              MODEL_CALL_TIMEOUT_MS
            );

            const text = parseCompletionText(finalCompletion);
            const structured = parseStructuredReply(text, params.message);

            if (structured) {
              answerText = structured.message;
              bundledSuggestions = structured.suggestions;
            } else if (text) {
              answerText = text;
              bundledSuggestions = await generateFollowUpSuggestions({
                openai,
                model: candidateModel,
                answerText: text,
                userMessage: params.message,
                env: this.env,
              });
            }

            activeModel = candidateModel;
            break;
          } else {
            // No tools needed
            const text = parseCompletionText(completion);
            const structured = parseStructuredReply(text, params.message);

            if (structured) {
              answerText = structured.message;
              bundledSuggestions = structured.suggestions;
            } else if (text && mcpTools) {
              answerText = text;
              bundledSuggestions = await generateFollowUpSuggestions({
                openai,
                model: candidateModel,
                answerText: text,
                userMessage: params.message,
                env: this.env,
              });
            }

            if (answerText) {
              activeModel = candidateModel;
              break;
            }
          }
        } catch (error) {
          console.error('ChatAgent: Model call failed', {
            traceId,
            model: candidateConfig.model,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      if (!answerText) {
        throw new Error(`Model request failed. traceId=${traceId}`);
      }

      // Create assistant message in database
      await createMessage(db, {
        id: generateId(),
        userId: this.state.userId,
        conversationId: this.state.conversationId,
        role: 'assistant',
        message: answerText,
        files: null,
        generatedImageUrls: null,
        searchResults: null,
        createdAt: new Date(),
      });

      // Update conversation
      await updateConversation(db, this.state.conversationId, { updatedAt: now });

      // Update state with new message
      this.setState({
        ...this.state,
        status: 'idle',
        messages: [
          ...this.state.messages,
          { id: generateId(), role: 'user', content: params.message, createdAt: Date.now() },
          { id: generateId(), role: 'assistant', content: answerText, createdAt: Date.now() },
        ],
        activeModel,
      });

      return {
        message: answerText,
        suggestions: bundledSuggestions,
        model: activeModel,
        traceId,
      };
    } catch (error) {
      console.error('ChatAgent: sendMessage failed', {
        traceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      this.setState({
        ...this.state,
        status: 'error',
        lastError: {
          code: 'SEND_MESSAGE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          traceId,
        },
      });

      throw error;
    }
  }

  /**
   * List available MCP tools
   */
  @callable()
  async listTools(): Promise<ToolInfo[]> {
    if (!this.isMcpConfigured()) return [];

    try {
      const tools = this.mcp.listTools();
      return tools.map((t) => ({
        name: t.name,
        description: `Tool from ${t.serverId}`,
        serverId: t.serverId,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get current agent state
   */
  @callable()
  async getState(): Promise<ChatAgentState> {
    return this.state;
  }

  /**
   * Reset agent state
   */
  @callable()
  async resetState(): Promise<void> {
    this.setState({
      ...this.initialState,
      conversationId: this.state.conversationId,
      userId: this.state.userId,
    });
  }
}
