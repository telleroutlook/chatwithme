/**
 * Agent Client for ChatWithMe
 *
 * This module provides React hooks for interacting with the ChatAgent
 * via the REST API with the X-Use-Agent header (for now).
 * This can be upgraded to a full WebSocket connection later.
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  ChatAgentState,
  SendMessageParams,
  SendMessageResult,
  ToolInfo,
} from '@chatwithme/shared';

// ============================================================================
// Types
// ============================================================================

export interface UseChatAgentOptions {
  conversationId: string | null;
  userId: string | null;
  enabled?: boolean;
  onStateUpdate?: (state: ChatAgentState) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface UseChatAgentReturn {
  // State
  state: ChatAgentState | null;
  isConnected: boolean;
  isInitializing: boolean;
  error: Error | null;

  // Actions
  initializeConversation: (conversationId: string, userId: string) => Promise<void>;
  sendMessage: (params: SendMessageParams) => Promise<SendMessageResult>;
  listTools: () => Promise<ToolInfo[]>;
  getState: () => Promise<ChatAgentState>;
  resetState: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for interacting with the ChatAgent
 *
 * Note: Currently uses REST API with X-Use-Agent header.
 * Can be upgraded to full WebSocket connection later.
 */
export function useChatAgent(options: UseChatAgentOptions): UseChatAgentReturn {
  const { conversationId, userId, enabled = true, onStateUpdate, onError, onOpen, onClose } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [internalState, setInternalState] = useState<ChatAgentState | null>(null);

  // Update connection state when conversationId changes
  useEffect(() => {
    if (conversationId && enabled) {
      setIsConnected(true);
      onOpen?.();
    } else {
      setIsConnected(false);
      onClose?.();
    }
  }, [conversationId, enabled, onOpen, onClose]);

  // Notify state updates
  useEffect(() => {
    if (internalState) {
      onStateUpdate?.(internalState);
    }
  }, [internalState, onStateUpdate]);

  // Initialize conversation
  const initializeConversation = useCallback(
    async (convId: string, uid: string) => {
      setIsInitializing(true);
      try {
        // Update internal state to reflect initialization
        setInternalState({
          conversationId: convId,
          userId: uid,
          messages: [],
          toolRuns: {},
          uiBlocks: [],
          status: 'idle',
          activeModel: null,
          lastError: null,
          traceId: null,
        });
        setError(null);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to initialize');
        setError(error);
        onError?.(error);
        throw error;
      } finally {
        setIsInitializing(false);
      }
    },
    [onError]
  );

  // Initialize when connection is established
  useEffect(() => {
    if (isConnected && conversationId && userId && enabled) {
      initializeConversation(conversationId, userId).catch(() => {
        // Error is already handled in initializeConversation
      });
    }
  }, [isConnected, conversationId, userId, enabled, initializeConversation]);

  // Send message - returns a placeholder, actual messaging goes through REST API
  const sendMessage = useCallback(
    async (_params: SendMessageParams): Promise<SendMessageResult> => {
      if (!isConnected) {
        throw new Error('Agent not connected');
      }
      setError(null);

      // Update status to thinking
      setInternalState((prev) =>
        prev
          ? {
              ...prev,
              status: 'thinking',
            }
          : null
      );

      try {
        // In a full implementation, this would call the agent via WebSocket
        // For now, this is a placeholder - actual messaging uses REST API with X-Use-Agent header
        const result: SendMessageResult = {
          message: '',
          suggestions: [],
          model: 'unknown',
          traceId: '',
        };

        // Update status back to idle
        setInternalState((prev) =>
          prev
            ? {
                ...prev,
                status: 'idle',
              }
            : null
        );

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to send message');
        setError(error);
        onError?.(error);

        // Update status to error
        setInternalState((prev) =>
          prev
            ? {
                ...prev,
                status: 'error',
                lastError: {
                  code: 'SEND_MESSAGE_FAILED',
                  message: error.message,
                  traceId: '',
                },
              }
            : null
        );

        throw error;
      }
    },
    [isConnected, onError]
  );

  // List tools
  const listTools = useCallback(async (): Promise<ToolInfo[]> => {
    if (!isConnected) {
      return [];
    }
    // In a full implementation, this would fetch tools from the agent
    return [];
  }, [isConnected]);

  // Get state
  const getState = useCallback(async (): Promise<ChatAgentState> => {
    if (!isConnected || !internalState) {
      throw new Error('Agent not connected');
    }
    return internalState;
  }, [isConnected, internalState]);

  // Reset state
  const resetState = useCallback(async (): Promise<void> => {
    if (!isConnected) {
      throw new Error('Agent not connected');
    }
    setInternalState(null);
  }, [isConnected]);

  return {
    state: internalState,
    isConnected,
    isInitializing,
    error,
    initializeConversation,
    sendMessage,
    listTools,
    getState,
    resetState,
  };
}

// ============================================================================
// Utility Hook: Agent vs REST Selection
// ============================================================================

export interface UseAgentOrRestOptions {
  conversationId: string | null;
  userId: string | null;
  preferAgent?: boolean;
}

export interface UseAgentOrRestReturn {
  useAgent: boolean;
  agent: UseChatAgentReturn;
}

/**
 * Hook that decides whether to use Agent or REST API
 * based on availability and user preference
 *
 * Currently defaults to REST API until full WebSocket implementation.
 */
export function useAgentOrRest(options: UseAgentOrRestOptions): UseAgentOrRestReturn {
  const { conversationId, userId, preferAgent = false } = options;

  // Check if agent is available
  const [agentAvailable, setAgentAvailable] = useState(false);

  useEffect(() => {
    // Check for agent availability
    const checkAgentAvailability = async () => {
      try {
        // For now, agent is disabled until full WebSocket implementation
        // This can be enabled via feature flag in the future
        const hasWebSocket = typeof WebSocket !== 'undefined';
        const featureEnabled = false; // Disabled until full implementation
        setAgentAvailable(hasWebSocket && featureEnabled);
      } catch {
        setAgentAvailable(false);
      }
    };
    checkAgentAvailability();
  }, []);

  const shouldUseAgent = preferAgent && agentAvailable && !!conversationId;

  const agent = useChatAgent({
    conversationId: shouldUseAgent ? conversationId : null,
    userId,
    enabled: shouldUseAgent,
  });

  return {
    useAgent: shouldUseAgent,
    agent,
  };
}
