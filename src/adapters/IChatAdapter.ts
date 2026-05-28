import { ChatMessage, ChatOptions, ChatResponse, ChatResponseWithTools, StreamEventCallback } from '../types/types';

/**
 * Chat adapter interface — protocol-agnostic chat operations
 */
export interface IChatAdapter {
  /** Non-streaming chat */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /** Streaming chat with optional event callback */
  chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
    onEvent?: StreamEventCallback
  ): Promise<ChatResponseWithTools>;
}

/**
 * Tool use adapter interface — optional, for providers that support tool calling
 */
export interface IToolUseAdapter {
  chatWithTools(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponseWithTools>;

  executeToolUseLoop(
    messages: ChatMessage[],
    options: ChatOptions,
    executor: any,
    loopOptions?: any
  ): Promise<any>;

  executeToolsParallel(
    toolCalls: any[],
    executor: any,
    options?: any
  ): Promise<Map<string, any>>;
}

/**
 * Type guard: does an adapter support tool use?
 */
export function isToolUseAdapter(adapter: IChatAdapter): adapter is IChatAdapter & IToolUseAdapter {
  return (
    'chatWithTools' in adapter &&
    'executeToolUseLoop' in adapter &&
    'executeToolsParallel' in adapter
  );
}
