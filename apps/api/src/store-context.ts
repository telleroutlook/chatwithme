import type { Db } from './db';

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  AI: Ai;
  ENVIRONMENT: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_BASE_URL: string;
  JWT_SECRET: string;
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

// Helper to create context from Hono context
export function createContext(env: Env): AppContext {
  const { createDb } = require('./db');
  return {
    env,
    db: createDb(env.DB),
  };
}
