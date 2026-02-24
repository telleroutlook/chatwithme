// Unified entry point for MCP operations
// Orchestrates model-driven tool calling

import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import type { ToolCall } from './parser';
import { AVAILABLE_TOOLS } from './tools';
import { MCPHttpClient } from './client';
import { executeToolCall } from './executor';

export interface ToolCallResult {
  success: boolean;
  results: string;
  error?: string;
}

export class MCPManager {
  private searchClient: MCPHttpClient;
  private readerClient: MCPHttpClient;
  private clients: Map<string, MCPHttpClient>;

  constructor(private env: {
    BIGMODEL_API_KEY?: string;
    OPENROUTER_API_KEY: string;
    MCP_WEB_SEARCH_URL?: string;
    MCP_WEB_READER_URL?: string;
  }) {
    const apiKey = env.BIGMODEL_API_KEY || env.OPENROUTER_API_KEY;

    this.searchClient = new MCPHttpClient(
      env.MCP_WEB_SEARCH_URL || 'https://open.bigmodel.cn/api/mcp/web_search_prime/mcp',
      apiKey
    );

    this.readerClient = new MCPHttpClient(
      env.MCP_WEB_READER_URL || 'https://open.bigmodel.cn/api/mcp/web_reader/mcp',
      apiKey
    );

    this.clients = new Map([
      ['web_search', this.searchClient],
      ['web_reader', this.readerClient],
    ]);
  }

  /**
   * Get available tool definitions (to pass to model)
   */
  getAvailableTools(): ChatCompletionTool[] {
    return AVAILABLE_TOOLS;
  }

  /**
   * Check if MCP is properly configured
   */
  isConfigured(): boolean {
    const apiKey = this.env.BIGMODEL_API_KEY || this.env.OPENROUTER_API_KEY;
    return Boolean(apiKey);
  }

  /**
   * Execute model-decided tool calls
   */
  async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolCallResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        results: '',
        error: 'MCP 未配置：缺少 API Key',
      };
    }

    const results: string[] = [];
    let hasError = false;

    const clientsRecord: Record<string, MCPHttpClient> = {
      web_search: this.searchClient,
      web_reader: this.readerClient,
    };

    for (const toolCall of toolCalls) {
      const { name, arguments: args } = toolCall.function;

      try {
        const params = JSON.parse(args);
        const result = await executeToolCall(name, params, clientsRecord);
        results.push(`【${name}】\n${result}`);
      } catch (error) {
        hasError = true;
        const message = error instanceof Error ? error.message : String(error);
        results.push(`【${name}】执行失败: ${message}`);
      }
    }

    return {
      success: !hasError,
      results: results.join('\n\n'),
    };
  }
}
