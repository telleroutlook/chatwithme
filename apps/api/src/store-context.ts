import type { Db } from './db';
import { createDb } from './db';

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  AI: Ai;
  ENVIRONMENT: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_BASE_URL: string;
  OPENROUTER_CHAT_MODEL?: string;
  OPENROUTER_SUGGESTION_MODEL?: string;
  OPENROUTER_FALLBACK_MODEL?: string;
  JWT_SECRET: string;
  BIGMODEL_API_KEY?: string;  // MCP service authentication (can reuse OPENROUTER_API_KEY)
  MCP_WEB_SEARCH_URL?: string;  // Optional, default: https://open.bigmodel.cn/api/mcp/web_search_prime/mcp
  MCP_WEB_READER_URL?: string;  // Optional, default: https://open.bigmodel.cn/api/mcp/web_reader/mcp
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
