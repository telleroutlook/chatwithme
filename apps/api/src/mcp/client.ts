// MCP HTTP client using Cloudflare agents SDK
// Supports streamable-http protocol for Edge runtime

import { MCPClientManager } from 'agents/mcp/client';

export class MCPHttpClient {
  private manager: MCPClientManager;
  private serverId: string | null = null;
  private url: string;
  private apiKey: string;

  constructor(url: string, apiKey: string) {
    this.url = url;
    this.apiKey = apiKey;
    this.manager = new MCPClientManager('chatwithme', '1.0.0');
  }

  private async ensureConnection(): Promise<void> {
    if (this.serverId) return;

    try {
      const connected = await this.manager.connect(this.url, {
        transport: {
          type: 'streamable-http',
          requestInit: {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
            },
          },
        },
      });
      this.serverId = connected.id;
    } catch (error) {
      throw new Error(`MCP connection failed to ${this.url}: ${error}`, { cause: error });
    }
  }

  async callTool(toolName: string, params: unknown): Promise<unknown> {
    await this.ensureConnection();

    if (!this.serverId) {
      throw new Error('MCP not connected');
    }

    try {
      // callTool: (params, resultSchema?, options?) => Promise
      const result = await this.manager.callTool(
        {
          serverId: this.serverId,
          name: toolName,
          arguments: params as Record<string, unknown>,
        },
        undefined, // resultSchema - optional
        undefined // options - optional
      );
      return result;
    } catch (error) {
      throw new Error(`MCP tool call failed for ${toolName}: ${error}`, { cause: error });
    }
  }

  async listTools(): Promise<unknown[]> {
    await this.ensureConnection();

    if (!this.serverId) {
      throw new Error('MCP not connected');
    }

    try {
      // listTools() returns tools across all connections
      const allTools = await this.manager.listTools();
      // Filter tools for this server only
      const serverTools = allTools.filter(
        (t: { serverId: string }) => t.serverId === this.serverId
      );
      return serverTools;
    } catch (error) {
      throw new Error(`MCP list tools failed: ${error}`, { cause: error });
    }
  }
}
