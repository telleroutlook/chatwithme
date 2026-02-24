// Parse tool calls from model response
// Handle OpenAI Function Calling format

import type { ChatCompletionMessageToolCall } from 'openai/resources/chat/completions';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Extract tool calls from a completion response
 * @param completion - The completion object from OpenAI API
 * @returns Array of tool calls, or empty array if none
 */
export function parseToolCalls(completion: { choices: Array<{ message: { tool_calls?: ChatCompletionMessageToolCall[] | null } }> }): ToolCall[] {
  const toolCalls = completion.choices[0]?.message?.tool_calls;

  if (!toolCalls || toolCalls.length === 0) {
    return [];
  }

  return toolCalls.map((call) => ({
    id: call.id,
    type: 'function',
    function: {
      name: call.function.name,
      arguments: call.function.arguments,
    },
  }));
}
