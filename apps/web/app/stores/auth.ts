import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserSafe, AuthTokens } from '@chatwithme/shared';

interface AuthState {
  user: UserSafe | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  setAuth: (user: UserSafe, tokens: AuthTokens) => void;
  updateTokens: (accessToken: string, expiresIn: number) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      setAuth: (user, tokens) =>
        set({
          user,
          tokens,
          isAuthenticated: true,
        }),
      updateTokens: (accessToken, expiresIn) =>
        set((state) => ({
          tokens: state.tokens
            ? { ...state.tokens, accessToken, expiresIn }
            : null,
        })),
      logout: () =>
        set({
          user: null,
          tokens: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'chatwithme-auth',
    }
  )
);
