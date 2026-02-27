/**
 * ChatAgent Types
 * Shared types for Agent-first architecture
 */

// ============================================================================
// Tool Execution Types
// ============================================================================

export type ToolRunStatus = 'pending' | 'running' | 'success' | 'error';

export interface ToolRun {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: ToolRunStatus;
  result?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

// ============================================================================
// UI Block Types (for streaming UI updates)
// ============================================================================

export type UIBlockType = 'text' | 'tool_result' | 'suggestions' | 'error';

export interface TextBlock {
  id: string;
  type: 'text';
  content: string;
  createdAt: number;
}

export interface ToolResultBlock {
  id: string;
  type: 'tool_result';
  toolName: string;
  content: string;
  status: ToolRunStatus;
  createdAt: number;
}

export interface SuggestionsBlock {
  id: string;
  type: 'suggestions';
  items: string[];
  createdAt: number;
}

export interface ErrorBlock {
  id: string;
  type: 'error';
  code: string;
  message: string;
  traceId?: string;
  createdAt: number;
}

export type ChatUIBlock = TextBlock | ToolResultBlock | SuggestionsBlock | ErrorBlock;

// ============================================================================
// Processing Status Types
// ============================================================================

export type ProcessingStatus = 'idle' | 'thinking' | 'executing_tools' | 'error';

// ============================================================================
// ChatAgent State Types
// ============================================================================

export interface ChatAgentState {
  conversationId: string | null;
  userId: string | null;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: number;
  }>;
  toolRuns: Record<string, ToolRun>;
  uiBlocks: ChatUIBlock[];
  status: ProcessingStatus;
  activeModel: string | null;
  lastError: { code: string; message: string; traceId: string } | null;
  traceId: string | null;
}

// ============================================================================
// Agent RPC Method Types
// ============================================================================

export interface InitializeConversationParams {
  conversationId: string;
  userId: string;
}

export interface SendMessageParams {
  message: string;
  modelOverride?: string;
  files?: Array<{
    url: string;
    fileName: string;
    mimeType: string;
    size: number;
    extractedText?: string;
  }>;
}

export interface SendMessageResult {
  message: string;
  suggestions: string[];
  model: string;
  traceId: string;
}

export interface McpServerInfo {
  id: string;
  name: string;
  url: string;
  state: 'connected' | 'disconnected' | 'error';
}

export interface ToolInfo {
  name: string;
  description: string;
  serverId: string;
}
