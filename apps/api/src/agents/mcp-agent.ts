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
        if (!this.state.connections[service.key]) {
          await this.connectService(service.key, service.url, apiKey);
        }
      }

      // eslint-disable-next-line no-console -- MCP connection logging for debugging
      console.log('MCPAgent: All connections established');
    } catch (error) {
      console.error('MCPAgent: Failed to establish connections', error);
      throw error;
    }
  }

  /**
   * Connect to a single MCP service
   * @param key - Service key for state management
   * @param url - Service URL
   * @param apiKey - API key for authentication
   */
  private async connectService(key: string, url: string, apiKey: string): Promise<void> {
    await this.mcp.connect(url, {
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
        [key]: {
          url,
          connectedAt: Date.now(),
          lastUsed: Date.now(),
        },
      },
    });
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
   * Find tool by name using multiple matching strategies
   * @param tools - Available tools
   * @param toolName - Name to search for
   * @returns Found tool or undefined
   */
  private findTool(
    tools: Array<{ name: string; serverId: string }>,
    toolName: string
  ): { name: string; serverId: string } | undefined {
    // Strategy 1: Exact match
    const exactMatch = tools.find((t) => t.name === toolName);
    if (exactMatch) return exactMatch;

    // Strategy 2: Case-insensitive match
    const caseInsensitiveMatch = tools.find((t) => t.name.toLowerCase() === toolName.toLowerCase());
    if (caseInsensitiveMatch) return caseInsensitiveMatch;

    // Strategy 3: Partial match (for names like mcp__web_search_prime__webSearchPrime)
    const partialMatch = tools.find((t) => {
      const normalizedName = t.name.toLowerCase().replace(/_/g, '');
      const normalizedSearch = toolName.toLowerCase();
      return normalizedName.includes(normalizedSearch) || normalizedSearch.includes(normalizedName);
    });

    return partialMatch;
  }

  /**
   * Execute a tool call
   * @param toolName - Name of the tool to call
   * @param args - Arguments for the tool
   * @returns Formatted tool result
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    await this.ensureConnections();

    const tools = this.mcp.listTools();

    // Log available tools for debugging
    // eslint-disable-next-line no-console -- Tool name debugging for MCP
    console.log('MCPAgent: Looking for tool', {
      requestedName: toolName,
      availableTools: tools.map((t) => ({ name: t.name, serverId: t.serverId })),
    });

    // Try to find tool with multiple matching strategies
    const tool = this.findTool(tools, toolName);

    if (!tool) {
      const availableNames = tools.map((t) => t.name).join(', ');
      console.error('MCPAgent: Tool not found', {
        requestedName: toolName,
        availableNames,
      });
      throw new Error(`Tool not found: ${toolName}. Available tools: ${availableNames}`);
    }

    this.updateConnectionLastUsed(tool.serverId);

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
   * Update last used time for a connection
   * @param serverId - Server ID to update
   */
  private updateConnectionLastUsed(serverId: string): void {
    const connectionKey = Object.entries(this.state.connections).find(
      ([key, conn]) => conn.url.includes(serverId) || serverId.includes(key)
    )?.[0];

    if (connectionKey) {
      const conn = this.state.connections[connectionKey];
      this.setState({
        connections: {
          ...this.state.connections,
          [connectionKey]: {
            ...conn,
            lastUsed: Date.now(),
          },
        },
      });
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
