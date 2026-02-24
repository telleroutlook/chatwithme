// MCP JSON-RPC protocol types
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
