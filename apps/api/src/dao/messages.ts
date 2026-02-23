import { eq, desc, and } from 'drizzle-orm';
import type { Db } from '../db';
import { messages, type Message, type NewMessage } from '../models';

export async function createMessage(db: Db, message: NewMessage): Promise<Message> {
  const result = await db.insert(messages).values(message).returning();
  return result[0];
}

export async function getMessageById(db: Db, id: string): Promise<Message | undefined> {
  return db.select().from(messages).where(eq(messages.id, id)).get();
}

export async function getMessagesByConversationId(
  db: Db,
  conversationId: string,
  limit = 50
): Promise<Message[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit)
    .all();
}

export async function getRecentMessages(
  db: Db,
  conversationId: string,
  limit = 20
): Promise<Message[]> {
  const all = await getMessagesByConversationId(db, conversationId, limit);
  return all.reverse(); // Return in chronological order
}

export async function deleteMessagesByConversationId(
  db: Db,
  conversationId: string
): Promise<number> {
  const result = await db
    .delete(messages)
    .where(eq(messages.conversationId, conversationId))
    .returning();
  return result.length;
}
