// Execute tool calls and format results

import { MCPHttpClient } from './client';

const _MCP_TIMEOUT_MS = 10000;

// Map tool names to client keys
// The tool names (webSearchPrime, webReader) come from MCP service
// The client keys (web_search, web_reader) are internal identifiers
const TOOL_TO_CLIENT_KEY: Record<string, string> = {
  webSearchPrime: 'web_search',
  webReader: 'web_reader',
};

export async function executeToolCall(
  toolName: string,
  params: unknown,
  clients: Record<string, MCPHttpClient>
): Promise<string> {
  const clientKey = TOOL_TO_CLIENT_KEY[toolName] || toolName;
  const client = clients[clientKey];

  if (!client) {
    return `错误: 未找到工具 "${toolName}" 的客户端 (client key: ${clientKey})`;
  }

  try {
    const result = await client.callTool(toolName, params);
    return formatToolResult(toolName, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `工具 "${toolName}" 执行失败: ${message}`;
  }
}

// Format tool results based on the MCP response format
// The response from MCP SDK has a content array with typed chunks
function formatToolResult(toolName: string, result: unknown): string {
  // Extract text content from MCP response format
  const textContent = getTextFromMCPResult(result);
  if (textContent) {
    return textContent;
  }

  // Fallback to JSON formatting
  return JSON.stringify(result, null, 2);
}

// Extract text content from MCP tool result
// MCP SDK returns: { content: [{ type: 'text', text: '...' }] }
function getTextFromMCPResult(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;

  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;

  for (const chunk of content) {
    if (!chunk || typeof chunk !== 'object') continue;
    const typedChunk = chunk as { type?: string; text?: string; data?: string };
    if (typedChunk.type === 'text' && typeof typedChunk.text === 'string') {
      return typedChunk.text;
    }
    if (typedChunk.type === 'image' && typeof typedChunk.data === 'string') {
      return `[Image content: base64 data]`;
    }
  }

  return undefined;
}
