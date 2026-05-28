import { ChatMessage, ChatOptions, ChatResponse, ChatResponseWithTools, StreamEventCallback, ToolExecutor, ToolUseLoopOptions, ToolUseLoopResult, ToolUseBlock, ToolExecutionResult, ParallelExecutionOptions, Logger } from '../types/types';

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
    executor: ToolExecutor,
    loopOptions?: ToolUseLoopOptions,
    logger?: Logger
  ): Promise<ToolUseLoopResult>;

  executeToolsParallel(
    toolCalls: ToolUseBlock[],
    executor: ToolExecutor,
    options?: ParallelExecutionOptions
  ): Promise<Map<string, ToolExecutionResult>>;
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
