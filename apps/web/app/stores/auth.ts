import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserSafe, AuthTokens } from '@chatwithme/shared';

interface AuthState {
  user: UserSafe | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  setAuth: (user: UserSafe, tokens: AuthTokens) => void;
  updateTokens: (accessToken: string, expiresIn: number) => void;
  logout: () => void;
  setHasHydrated: (hydrated: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      hasHydrated: false,
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
      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
    }),
    {
      name: 'chatwithme-auth',
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
