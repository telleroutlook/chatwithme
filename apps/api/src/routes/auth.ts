import { Hono } from 'hono';
import type { Env } from '../store-context';
import { createDb } from '../db';
import { createUser, getUserByEmail, getUserByUsername } from '../dao/users';
import { createRefreshToken, deleteRefreshTokensByUserId, getRefreshTokenByToken, deleteRefreshToken } from '../dao/refresh-tokens';
import { hashPassword, verifyPassword, generateId } from '../utils/crypto';
import { signAccessToken, signRefreshToken, verifyToken } from '../utils/jwt';
import type { SignUpRequest, SignInRequest, AuthResponse, UserSafe } from '../types';

const auth = new Hono<{ Bindings: Env }>();

// Sign up
auth.post('/signup', async (c) => {
  try {
    const body = await c.req.json<SignUpRequest>();
    const { email, username, password } = body;

    // Validation
    if (!email || !username || !password) {
      return c.json({ success: false, error: 'All fields are required' }, 400);
    }

    if (password.length < 6) {
      return c.json({ success: false, error: 'Password must be at least 6 characters' }, 400);
    }

    const db = createDb(c.env.DB);

    // Check existing user
    const existingEmail = await getUserByEmail(db, email);
    if (existingEmail) {
      return c.json({ success: false, error: 'Email already registered' }, 400);
    }

    const existingUsername = await getUserByUsername(db, username);
    if (existingUsername) {
      return c.json({ success: false, error: 'Username already taken' }, 400);
    }

    // Create user
    const hashedPassword = await hashPassword(password);
    const now = new Date();
    const userId = generateId();

    const user = await createUser(db, {
      id: userId,
      email,
      username,
      password: hashedPassword,
      avatar: '',
      emailVerifiedAt: now, // Auto-verify for simplified auth
      createdAt: now,
      updatedAt: now,
    });

    // Generate tokens
    const tokenPayload = { userId: user.id, email: user.email };
    const accessToken = await signAccessToken(tokenPayload, c.env.JWT_SECRET);
    const refreshToken = await signRefreshToken(tokenPayload, c.env.JWT_SECRET);

    // Store refresh token
    const refreshTokenId = generateId();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

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
    };

    const response: AuthResponse = {
      user: userSafe,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 900, // 15 minutes
      },
    };

    return c.json({ success: true, data: response });
  } catch (error) {
    console.error('Signup error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

// Sign in
auth.post('/signin', async (c) => {
  try {
    const body = await c.req.json<SignInRequest>();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ success: false, error: 'Email and password are required' }, 400);
    }

    const db = createDb(c.env.DB);

    // Find user
    const user = await getUserByEmail(db, email);
    if (!user) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401);
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401);
    }

    // Generate tokens
    const tokenPayload = { userId: user.id, email: user.email };
    const accessToken = await signAccessToken(tokenPayload, c.env.JWT_SECRET);
    const refreshToken = await signRefreshToken(tokenPayload, c.env.JWT_SECRET);

    // Delete old refresh tokens and create new one
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

// Refresh token
auth.post('/refresh', async (c) => {
  try {
    const body = await c.req.json<{ refreshToken: string }>();
    const { refreshToken } = body;

    if (!refreshToken) {
      return c.json({ success: false, error: 'Refresh token is required' }, 400);
    }

    const db = createDb(c.env.DB);

    // Verify refresh token
    const payload = await verifyToken(refreshToken, c.env.JWT_SECRET);
    if (!payload) {
      return c.json({ success: false, error: 'Invalid refresh token' }, 401);
    }

    // Check if refresh token exists in DB
    const storedToken = await getRefreshTokenByToken(db, refreshToken);
    if (!storedToken) {
      return c.json({ success: false, error: 'Refresh token not found' }, 401);
    }

    // Check expiration
    if (storedToken.expiresAt < new Date()) {
      await deleteRefreshToken(db, refreshToken);
      return c.json({ success: false, error: 'Refresh token expired' }, 401);
    }

    // Generate new access token
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

// Sign out
auth.post('/signout', async (c) => {
  try {
    const body = await c.req.json<{ refreshToken?: string }>();
    const { refreshToken } = body;

    if (refreshToken) {
      const db = createDb(c.env.DB);
      await deleteRefreshToken(db, refreshToken);
    }

    return c.json({ success: true, data: { message: 'Signed out successfully' } });
  } catch (error) {
    console.error('Signout error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

// Get current user (protected)
auth.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }

  const db = createDb(c.env.DB);
  const user = await getUserByEmail(db, payload.email);

  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }

  const userSafe: UserSafe = {
    id: user.id,
    email: user.email,
    username: user.username,
    avatar: user.avatar || '',
  };

  return c.json({ success: true, data: { user: userSafe } });
});

export default auth;
