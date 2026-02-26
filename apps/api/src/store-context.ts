import type { Db } from './db';
import { createDb } from './db';
import type { MCPAgent } from './agents/mcp-agent';

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  AI: Ai;
  MCPAgent: DurableObjectNamespace<MCPAgent>;
  ENVIRONMENT: string;

  // 默认 API Key (当模型级别 API Key 未设置时使用)
  OPENROUTER_API_KEY: string;
  JWT_SECRET: string;

  // 聊天主模型配置
  CHAT_PRIMARY_BASE_URL: string;
  CHAT_PRIMARY_MODEL: string;
  CHAT_PRIMARY_API_KEY?: string;

  // 聊天备用模型配置
  CHAT_FALLBACK_BASE_URL?: string;
  CHAT_FALLBACK_MODEL?: string;
  CHAT_FALLBACK_API_KEY?: string;

  // 图片主模型配置
  IMAGE_PRIMARY_BASE_URL?: string;
  IMAGE_PRIMARY_MODEL?: string;
  IMAGE_PRIMARY_API_KEY?: string;

  // 图片备用模型配置
  IMAGE_FALLBACK_BASE_URL?: string;
  IMAGE_FALLBACK_MODEL?: string;
  IMAGE_FALLBACK_API_KEY?: string;

  // MCP 服务配置
  BIGMODEL_API_KEY?: string; // MCP service authentication (can reuse OPENROUTER_API_KEY)
  MCP_WEB_SEARCH_URL?: string; // Optional, default: https://open.bigmodel.cn/api/mcp/web_search_prime/mcp
  MCP_WEB_READER_URL?: string; // Optional, default: https://open.bigmodel.cn/api/mcp/web_reader/mcp

  // Chat completion parameters (GLM-5 compatible)
  CHAT_MAX_TOKENS?: string; // Default: 65536
  CHAT_TEMPERATURE?: string; // Default: 0.5
  CHAT_TOP_P?: string; // Default: 0.9
  CHAT_THINKING_ENABLED?: string; // Default: false
  CHAT_STREAM_ENABLED?: string; // Default: false
  CHAT_SYSTEM_PROMPT?: string; // Default: Claude system prompt
}

export interface AuthInfo {
  userId: string;
  email: string;
}

export interface AppContext {
  env: Env;
  db: Db;
  auth?: AuthInfo;
}

export interface AppVariables {
  userId: string;
  email: string;
}

export interface AppBindings {
  Bindings: Env;
  Variables: AppVariables;
}

// Helper to create context from Hono context
export function createContext(env: Env): AppContext {
  return {
    env,
    db: createDb(env.DB),
  };
}
