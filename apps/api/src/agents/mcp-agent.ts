import { Agent } from 'agents';
import type { Env } from '../store-context';

// Agent state type
export type MCPAgentState = {
  connections: Record<
    string,
    {
      url: string;
      connectedAt: number;
      lastUsed: number;
    }
  >;
};

/**
 * MCPAgent - Manage MCP connections and tool calls via Agent SDK
 *
 * Responsibilities:
 * 1. Manage connections to external MCP servers
 * 2. Provide AI SDK compatible tools via getAITools()
 * 3. Execute tool calls
 * 4. Persist connection state in DurableObject storage
 */
export class MCPAgent extends Agent<Env, MCPAgentState> {
  // Initial state
  initialState: MCPAgentState = {
    connections: {},
  };

  /**
   * Agent startup - initialize MCP connections
   */
  async onStart(): Promise<void> {
    // eslint-disable-next-line no-console -- MCP agent startup logging for debugging
    console.log('MCPAgent: Starting');
    await this.ensureConnections();
  }

  /**
   * Ensure MCP connections are established
   */
  private async ensureConnections(): Promise<void> {
    const apiKey = this.env.BIGMODEL_API_KEY || this.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      console.warn('MCPAgent: No API key configured');
      return;
    }

    const searchUrl =
      this.env.MCP_WEB_SEARCH_URL || 'https://open.bigmodel.cn/api/mcp/web_search_prime/mcp';
    const readerUrl =
      this.env.MCP_WEB_READER_URL || 'https://open.bigmodel.cn/api/mcp/web_reader/mcp';

    try {
      // Connect to search service if not already connected
      if (!this.state.connections['web_search']) {
        await this.mcp.connect(searchUrl, {
          transport: {
            type: 'streamable-http',
            requestInit: {
              headers: { Authorization: `Bearer ${apiKey}` },
            },
          },
        });

        this.setState({
          connections: {
            ...this.state.connections,
            web_search: {
              url: searchUrl,
              connectedAt: Date.now(),
              lastUsed: Date.now(),
            },
          },
        });
      }

      // Connect to reader service if not already connected
      if (!this.state.connections['web_reader']) {
        await this.mcp.connect(readerUrl, {
          transport: {
            type: 'streamable-http',
            requestInit: {
              headers: { Authorization: `Bearer ${apiKey}` },
            },
          },
        });

        this.setState({
          connections: {
            ...this.state.connections,
            web_reader: {
              url: readerUrl,
              connectedAt: Date.now(),
              lastUsed: Date.now(),
            },
          },
        });
      }

      // eslint-disable-next-line no-console -- MCP connection logging for debugging
      console.log('MCPAgent: All connections established');
    } catch (error) {
      console.error('MCPAgent: Failed to establish connections', error);
      throw error;
    }
  }

  /**
   * Get AI SDK compatible tools
   * This is the main method for Hono routes to get tools
   */
  async getAITools() {
    await this.ensureConnections();
    return this.mcp.getAITools();
  }

  /**
   * Execute a tool call
   * @param toolName - Name of the tool to call
   * @param args - Arguments for the tool
   * @returns Formatted tool result
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    await this.ensureConnections();

    // Find which server has the tool
    const tools = this.mcp.listTools();

    // Log available tools for debugging
    // eslint-disable-next-line no-console -- Tool name debugging for MCP
    console.log('MCPAgent: Looking for tool', {
      requestedName: toolName,
      availableTools: tools.map((t) => ({ name: t.name, serverId: t.serverId })),
    });

    // Try exact match first
    let tool = tools.find((t) => t.name === toolName);

    // If not found, try case-insensitive match
    if (!tool) {
      tool = tools.find((t) => t.name.toLowerCase() === toolName.toLowerCase());
    }

    // If still not found, try partial match (for names like mcp__web_search_prime__webSearchPrime)
    if (!tool) {
      tool = tools.find(
        (t) =>
          t.name.toLowerCase().includes(toolName.toLowerCase()) ||
          toolName.toLowerCase().includes(t.name.toLowerCase().replace(/_/g, ''))
      );
    }

    if (!tool) {
      const availableNames = tools.map((t) => t.name).join(', ');

      console.error('MCPAgent: Tool not found', {
        requestedName: toolName,
        availableNames,
      });
      throw new Error(`Tool not found: ${toolName}. Available tools: ${availableNames}`);
    }

    // Update last used time for the connection
    const serverId = tool.serverId;
    for (const [key, conn] of Object.entries(this.state.connections)) {
      if (conn.url.includes(serverId) || serverId.includes(key)) {
        this.setState({
          connections: {
            ...this.state.connections,
            [key]: {
              ...conn,
              lastUsed: Date.now(),
            },
          },
        });
        break;
      }
    }

    // Call the tool via MCP client manager
    const result = await this.mcp.callTool({
      serverId: tool.serverId,
      name: toolName,
      arguments: args,
    });

    // Format the result
    return this.formatToolResult(result);
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

  /**
   * Check if MCP is configured
   */
  isConfigured(): boolean {
    const apiKey = this.env.BIGMODEL_API_KEY || this.env.OPENROUTER_API_KEY;
    return Boolean(apiKey);
  }

  /**
   * State update callback
   */
  onStateUpdate(state: MCPAgentState, _source: unknown): void {
    // eslint-disable-next-line no-console -- MCP state logging for debugging
    console.log('MCPAgent state updated:', state);
  }
}
