import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '~/stores/auth';

/**
 * Hook for authentication guard and data loading
 * Redirects to signin if not authenticated, loads conversations when authenticated
 *
 * @param onLoadConversations - Function to call when authenticated to load conversations
 *
 * @example
 * ```tsx
 * const { isLoading } = useAuthGuard(loadConversations);
 * if (isLoading) return <LoadingSpinner />;
 * ```
 */
export function useAuthGuard(onLoadConversations: () => void | Promise<void>): {
  isLoading: boolean;
} {
  const navigate = useNavigate();
  const { isAuthenticated, hasHydrated } = useAuthStore();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      navigate('/signin');
    } else {
      onLoadConversations();
    }
  }, [hasHydrated, isAuthenticated, navigate, onLoadConversations]);

  const isLoading = !hasHydrated || !isAuthenticated;

  return { isLoading };
}
