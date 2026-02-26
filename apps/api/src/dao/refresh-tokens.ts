import { eq, lt } from 'drizzle-orm';
import type { Db } from '../db';
import { refreshTokens, type RefreshToken, type NewRefreshToken } from '../models';

export async function createRefreshToken(db: Db, token: NewRefreshToken): Promise<RefreshToken> {
  const result = await db.insert(refreshTokens).values(token).returning();
  return result[0];
}

export async function getRefreshTokenByToken(
  db: Db,
  token: string
): Promise<RefreshToken | undefined> {
  return db.select().from(refreshTokens).where(eq(refreshTokens.token, token)).get();
}

export async function deleteRefreshToken(db: Db, token: string): Promise<boolean> {
  const result = await db.delete(refreshTokens).where(eq(refreshTokens.token, token)).returning();
  return result.length > 0;
}

export async function deleteRefreshTokensByUserId(db: Db, userId: string): Promise<number> {
  const result = await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId)).returning();
  return result.length;
}

export async function deleteExpiredRefreshTokens(db: Db): Promise<number> {
  const now = new Date();
  const result = await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, now)).returning();
  return result.length;
}
