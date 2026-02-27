# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a Turborepo monorepo for a Cloudflare Workers full-stack AI chat application using GLM-4.7 models.

### Repository Structure

```
chatwithme/
├── apps/
│   ├── api/          # Cloudflare Workers backend (Hono)
│   └── web/          # React Router v7 frontend (SPA)
├── packages/
│   └── shared/       # TypeScript types shared between api and web
├── docs/             # Project documentation
└── scripts/          # Build and deployment scripts
```

### Key Technologies

- **Backend**: Hono + Cloudflare Workers + Drizzle ORM (D1)
- **Frontend**: React Router v7 + React 19 + TanStack Query + Zustand
- **AI**: OpenAI SDK with GLM-4.7 (chat) + GLM-4.6v (vision)
- **MCP**: Cloudflare Agent SDK with Durable Objects for MCP server connections
- **Storage**: D1 (metadata) + R2 (files)

## Common Commands

### Development

```bash
# Start both api and web in development mode
npm run dev

# Start only api (runs on :8787)
pnpm --filter @chatwithme/api dev

# Start only web (runs on :5173)
pnpm --filter @chatwithme/web dev
```

### Build & Deploy

```bash
# Build all packages
npm run build

# Deploy to production (builds web + deploys api with assets)
npm run deploy
```

### Code Quality

```bash
# Lint all packages
npm run lint

# Lint specific package
pnpm --filter @chatwithme/web lint

# Type check
npm run typecheck

# Format code
npm run format:fix
```

### Testing

```bash
# Run all tests
npm test

# Run web tests
pnpm --filter @chatwithme/web test

# Run api tests
pnpm --filter @chatwithme/api test
```

### Database (Drizzle)

```bash
# Generate migrations from schema changes
npm run db:generate

# Apply migrations to production D1
npm run db:migrate

# Apply migrations to local D1
npm run db:migrate:local

# Open Drizzle Studio
npm run db:studio
```

## Backend Architecture (apps/api)

### Entry Point

`src/index.ts` exports a Hono app with route mounting and static asset serving. Requests to `/auth`, `/chat`, `/file`, `/health` go to the Worker; all other requests serve the React SPA from R2 Assets.

### Cloudflare Bindings (wrangler.toml)

- `DB`: D1 Database (Drizzle ORM)
- `BUCKET`: R2 Bucket for file storage
- `AI`: Cloudflare AI Binding for model inference
- `MCPAgent`: Durable Object for MCP server connections
- `ASSETS`: Fetcher for serving static React build

### MCPAgent (src/agents/mcp-agent.ts)

Durable Object that manages connections to external MCP servers (web search, web reader). Uses Cloudflare Agent SDK's `mcp` client. Key methods:

- `getAITools()`: Returns AI SDK compatible tools
- `callTool()`: Executes a tool call via MCP

### Routes Structure

- `routes/auth.ts`: Authentication (signup, signin, refresh token)
- `routes/chat.ts`: Chat completions with GLM-4.7, tool calling, file handling
- `routes/file.ts`: File upload to R2 with public URL generation

### Models (src/models/)

Drizzle schema files using `sqliteTable`:

- `users.ts`: User accounts with email/password
- `conversations.ts`: Chat conversations per user
- `messages.ts`: Messages with JSON columns for files, search results, image analyses
- `refresh-tokens.ts`: JWT refresh token storage

### Environment Variables

Set via `wrangler secret`:

- `OPENROUTER_API_KEY` or `BIGMODEL_API_KEY`: Required for AI/MCP
- `JWT_SECRET`: For token signing

## Frontend Architecture (apps/web)

### React Router v7 Setup

- `app/routes.ts`: Route configuration using file-based routes
- `app/root.tsx`: Root layout with providers (QueryClient, theme SW registration)
- `app/client.ts`: Client hydration with performance monitoring

### State Management

- `app/stores/auth.ts`: Zustand store for auth state + token persistence
- `app/stores/chat.ts`: Zustand store for conversations and messages
- `app/stores/theme.ts`: Zustand store for theme (light/dark/system)

### API Client (app/client.ts)

ApiClient class with:

- Automatic Bearer token injection
- Token refresh on 401
- Retry with exponential backoff for 5xx errors

### Route Structure

- `routes/index.tsx`: Landing page
- `routes/signin.tsx` / `routes/signup.tsx`: Auth pages
- `routes/home.tsx`: Main chat interface (delegates to `pages/home/index.tsx`)

### Code Splitting (vite.config.ts)

Manual chunks for lazy loading:

- `markdown`: react-markdown, rehype, remark, highlight.js
- `katex`: Math rendering
- `mermaid`: Diagram rendering (2.4MB, on-demand)
- `pdfjs`: PDF viewing
- `office`: mammoth, xlsx, jszip (Office document viewing)

### Worker Thread

`app/workers/fileProcessor.worker.ts`: Handles PDF and Office document text extraction in a separate thread.

## Shared Types (packages/shared)

TypeScript types shared between frontend and backend:

- `User`, `Conversation`, `Message`: Core domain types
- `MessageFile`, `SearchResult`, `ImageAnalysis`: Message content types
- `AuthTokens`, `AuthResponse`: Authentication types
- `ApiResponse<T>`: Standard API response wrapper
- `errorMonitoring.ts`: Error tracking types

## Development Patterns

### Adding a New API Route

1. Create route file in `apps/api/src/routes/`
2. Export a Hono router with `zValidator` for request validation
3. Add to `apps/api/src/index.ts` route mounting
4. Define Zod schemas for request/response

### Adding Database Columns

1. Modify schema in `apps/api/src/models/`
2. Run `npm run db:generate` to create migration
3. Run `npm run db:migrate:local` to test locally
4. Update shared types in `packages/shared/src/index.ts` if needed

### Frontend Component with API Call

Use `useChatStore` for chat operations or `ApiClient` directly from `app/client.ts`. TanStack Query is configured but currently state management uses Zustand stores.

### File Upload Flow

1. Frontend creates `FormData` with file
2. POST to `/file/upload`
3. Backend uploads to R2 via `env.BUCKET.put()`
4. Returns public R2 URL
5. Frontend includes URL in chat message
6. Backend processes file (PDF text extraction, image analysis, etc.)

## Deployment

Production URL: https://chatwithme.lintao-mailbox.workers.dev

The `npm run deploy` script:

1. Builds the React app to `apps/web/build/client`
2. Deploys the Cloudflare Worker with static assets via wrangler
3. Worker serves API routes AND static assets (single app)

## Important Notes

- Node.js compatibility is enabled (`compatibility_flags = ["nodejs_compat"]`) in wrangler.toml
- SSR is disabled (`ssr: false` in vite.config.ts) - pure SPA
- MCP Agent requires `BIGMODEL_API_KEY` secret for tool calling
- Vision model (glm-4.6v) is auto-selected when images are present
- PDF documents use text extraction only (no vision model)
- Code files use OpenAI-compatible API for content extraction
