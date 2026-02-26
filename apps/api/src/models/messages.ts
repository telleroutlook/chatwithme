import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users';
import { conversations } from './conversations';

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  message: text('message').notNull(),
  files: text('files', { mode: 'json' }).$type<
    Array<{ url: string; fileName: string; mimeType: string; size: number; extractedText?: string }>
  >(),
  generatedImageUrls: text('generated_image_urls', { mode: 'json' }).$type<string[]>(),
  searchResults: text('search_results', { mode: 'json' }).$type<
    Array<{ title: string; url: string; snippet: string }>
  >(),
  imageAnalyses: text('image_analyses', { mode: 'json' }).$type<
    Array<{ fileName: string; analysis: string }>
  >(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
