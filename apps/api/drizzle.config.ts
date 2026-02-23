import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/models/index.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    // These will be overridden by wrangler for actual migrations
    accountId: 'local',
    databaseId: 'local',
    token: 'local',
  },
});
