import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppBindings } from '../store-context';
import { createDb } from '../db';
import { createUser, getUserByEmail, getUserByUsername, updateUser } from '../dao/users';
import {
  createRefreshToken,
  deleteRefreshToken,
  deleteRefreshTokensByUserId,
  getRefreshTokenByToken,
} from '../dao/refresh-tokens';
import { hashPassword, verifyPassword, generateId } from '../utils/crypto';
import { signAccessToken, signRefreshToken, verifyToken } from '../utils/jwt';
import { authMiddleware, getAuthInfo } from '../middleware/auth';
import { ERROR_CODES } from '../constants/error-codes';
import { errorResponse, validationErrorHook } from '../utils/response';
import type { AuthResponse, UserSafe, AppLocale } from '../types';

const auth = new Hono<AppBindings>();

const signUpSchema = z.object({
  email: z.string().email(),
  username: z.string().trim().min(1),
  password: z.string().min(6),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const signoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

auth.post('/signup', zValidator('json', signUpSchema, validationErrorHook), async (c) => {
  try {
    const { email, username, password } = c.req.valid('json');
    const db = createDb(c.env.DB);

    const existingEmail = await getUserByEmail(db, email);
    if (existingEmail) {
      return errorResponse(
        c,
        409,
        ERROR_CODES.EMAIL_ALREADY_REGISTERED,
        'Email already registered'
      );
    }

    const existingUsername = await getUserByUsername(db, username);
    if (existingUsername) {
      return errorResponse(c, 409, ERROR_CODES.USERNAME_ALREADY_TAKEN, 'Username already taken');
    }

    const hashedPassword = await hashPassword(password);
    const now = new Date();
    const userId = generateId();

    const user = await createUser(db, {
      id: userId,
      email,
      username,
      password: hashedPassword,
      avatar: '',
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const tokenPayload = { userId: user.id, email: user.email };
    const accessToken = await signAccessToken(tokenPayload, c.env.JWT_SECRET);
    const refreshToken = await signRefreshToken(tokenPayload, c.env.JWT_SECRET);

    const refreshTokenId = generateId();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await createRefreshToken(db, {
      id: refreshTokenId,
      userId: user.id,
      token: refreshToken,
      expiresAt,
      createdAt: now,
    });

    const userSafe: UserSafe = {
      id: user.id,
      email: user.email,
      username: user.username,
      avatar: user.avatar || '',
      language: user.language || 'en',
    };

    const response: AuthResponse = {
      user: userSafe,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 900,
      },
    };

    return c.json({ success: true, data: response });
  } catch (error) {
    console.error('Signup error:', error);
    return errorResponse(c, 500, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Internal Server Error');
  }
});

auth.post('/signin', zValidator('json', signInSchema, validationErrorHook), async (c) => {
  try {
    const { email, password } = c.req.valid('json');
    const db = createDb(c.env.DB);

    const user = await getUserByEmail(db, email);
    if (!user) {
      return errorResponse(c, 401, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials');
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return errorResponse(c, 401, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials');
    }

    const tokenPayload = { userId: user.id, email: user.email };
    const accessToken = await signAccessToken(tokenPayload, c.env.JWT_SECRET);
    const refreshToken = await signRefreshToken(tokenPayload, c.env.JWT_SECRET);

    await deleteRefreshTokensByUserId(db, user.id);

    const refreshTokenId = generateId();
    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await createRefreshToken(db, {
      id: refreshTokenId,
      userId: user.id,
      token: refreshToken,
      expiresAt,
      createdAt: now,
    });

    const userSafe: UserSafe = {
      id: user.id,
      email: user.email,
      username: user.username,
      avatar: user.avatar || '',
      language: user.language || 'en',
    };

    const response: AuthResponse = {
      user: userSafe,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 900,
      },
    };

    return c.json({ success: true, data: response });
  } catch (error) {
    console.error('Signin error:', error);
    return errorResponse(c, 500, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Internal Server Error');
  }
});

auth.post('/refresh', zValidator('json', refreshSchema, validationErrorHook), async (c) => {
  try {
    const { refreshToken } = c.req.valid('json');
    const db = createDb(c.env.DB);

    const payload = await verifyToken(refreshToken, c.env.JWT_SECRET);
    if (!payload) {
      return errorResponse(c, 401, ERROR_CODES.INVALID_REFRESH_TOKEN, 'Invalid refresh token');
    }

    const storedToken = await getRefreshTokenByToken(db, refreshToken);
    if (!storedToken) {
      return errorResponse(c, 401, ERROR_CODES.REFRESH_TOKEN_NOT_FOUND, 'Refresh token not found');
    }

    if (storedToken.expiresAt < new Date()) {
      await deleteRefreshToken(db, refreshToken);
      return errorResponse(c, 401, ERROR_CODES.REFRESH_TOKEN_EXPIRED, 'Refresh token expired');
    }

    const newAccessToken = await signAccessToken(
      { userId: payload.userId, email: payload.email },
      c.env.JWT_SECRET
    );

    return c.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        expiresIn: 900,
      },
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    return errorResponse(c, 500, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Internal Server Error');
  }
});

auth.post('/signout', zValidator('json', signoutSchema, validationErrorHook), async (c) => {
  try {
    const { refreshToken } = c.req.valid('json');

    if (refreshToken) {
      const db = createDb(c.env.DB);
      await deleteRefreshToken(db, refreshToken);
    }

    return c.json({ success: true, data: { message: 'Signed out successfully' } });
  } catch (error) {
    console.error('Signout error:', error);
    return errorResponse(c, 500, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Internal Server Error');
  }
});

auth.get('/me', authMiddleware, async (c) => {
  const { email } = getAuthInfo(c);
  const db = createDb(c.env.DB);
  const user = await getUserByEmail(db, email);

  if (!user) {
    return errorResponse(c, 404, ERROR_CODES.USER_NOT_FOUND, 'User not found');
  }

  const userSafe: UserSafe = {
    id: user.id,
    email: user.email,
    username: user.username,
    avatar: user.avatar || '',
    language: user.language || 'en',
  };

  return c.json({ success: true, data: { user: userSafe } });
});

const updatePreferencesSchema = z.object({
  language: z.enum(['en', 'zh']).optional(),
  username: z.string().trim().min(1).optional(),
});

auth.patch(
  '/me',
  authMiddleware,
  zValidator('json', updatePreferencesSchema, validationErrorHook),
  async (c) => {
    try {
      const { email, userId } = getAuthInfo(c);
      const { language, username } = c.req.valid('json');
      const db = createDb(c.env.DB);

      const user = await getUserByEmail(db, email);
      if (!user) {
        return errorResponse(c, 404, ERROR_CODES.USER_NOT_FOUND, 'User not found');
      }

      // Check username uniqueness if updating
      if (username && username !== user.username) {
        const existingUsername = await getUserByUsername(db, username);
        if (existingUsername) {
          return errorResponse(
            c,
            409,
            ERROR_CODES.USERNAME_ALREADY_TAKEN,
            'Username already taken'
          );
        }
      }

      // Update user preferences
      const updatedUser = await updateUser(db, userId, {
        ...(language !== undefined && { language }),
        ...(username !== undefined && { username }),
        updatedAt: new Date(),
      });

      if (!updatedUser) {
        return errorResponse(c, 500, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Failed to update user');
      }

      const userSafe: UserSafe = {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        avatar: updatedUser.avatar || '',
        language: updatedUser.language || 'en',
      };

      return c.json({ success: true, data: { user: userSafe } });
    } catch (error) {
      console.error('Update preferences error:', error);
      return errorResponse(c, 500, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Internal Server Error');
    }
  }
);

export default auth;
