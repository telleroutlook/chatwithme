import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { users, type User, type NewUser } from '../models';

export async function createUser(db: Db, user: NewUser): Promise<User> {
  const result = await db.insert(users).values(user).returning();
  return result[0];
}

export async function getUserById(db: Db, id: string): Promise<User | undefined> {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export async function getUserByEmail(db: Db, email: string): Promise<User | undefined> {
  return db.select().from(users).where(eq(users.email, email)).get();
}

export async function getUserByUsername(db: Db, username: string): Promise<User | undefined> {
  return db.select().from(users).where(eq(users.username, username)).get();
}

export async function updateUser(
  db: Db,
  id: string,
  data: Partial<Pick<User, 'username' | 'avatar' | 'language' | 'emailVerifiedAt' | 'updatedAt'>>
): Promise<User | undefined> {
  const result = await db.update(users).set(data).where(eq(users.id, id)).returning();
  return result[0];
}

export async function deleteUser(db: Db, id: string): Promise<boolean> {
  const result = await db.delete(users).where(eq(users.id, id)).returning();
  return result.length > 0;
}
