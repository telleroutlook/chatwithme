import { eq, desc } from 'drizzle-orm';
import type { Db } from '../db';
import { conversations, type Conversation, type NewConversation } from '../models';

export async function createConversation(
  db: Db,
  conversation: NewConversation
): Promise<Conversation> {
  const result = await db.insert(conversations).values(conversation).returning();
  return result[0];
}

export async function getConversationById(db: Db, id: string): Promise<Conversation | undefined> {
  return db.select().from(conversations).where(eq(conversations.id, id)).get();
}

export async function getConversationsByUserId(db: Db, userId: string): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .all();
}

export async function updateConversation(
  db: Db,
  id: string,
  data: Partial<Pick<Conversation, 'title' | 'starred' | 'updatedAt'>>
): Promise<Conversation | undefined> {
  const result = await db
    .update(conversations)
    .set(data)
    .where(eq(conversations.id, id))
    .returning();
  return result[0];
}

export async function deleteConversation(db: Db, id: string): Promise<boolean> {
  const result = await db.delete(conversations).where(eq(conversations.id, id)).returning();
  return result.length > 0;
}
