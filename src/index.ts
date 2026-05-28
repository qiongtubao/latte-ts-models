// Main client
export { AIClient, AIClientOptions } from './core/ai-client';

// Adapters
export { AnthropicAdapter } from './adapters/AnthropicAdapter';
export { OpenAIAdapter } from './adapters/OpenAIAdapter';
export { IChatAdapter, IToolUseAdapter, isToolUseAdapter } from './adapters/IChatAdapter';

// Types (Route layer + fundamental message types)
export type {
  ProviderConfig,
  ModelConfig,
  ChatMessage,
  ChatResponse,
  ChatResponseWithTools,
  ChatOptions,
  Usage,
  UsageStats,
  Logger,
  ToolDefinition,
  SchemaProperty,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ToolResultContent,
  StreamEvent,
  StreamEventCallback,
  Tokenizer,
  TruncateEvent,
  ToolExecutor,
  ToolExecutionResult,
  RetryEvent,
  FormatOptions,
  ToolUseLoopState,
  ToolUseLoopResultStatus,
  ToolUseLoopError,
  ToolUseLoopOptions,
  ToolUseLoopResult,
  ParallelExecutionOptions,
  PersistenceProvider,
  HistoryPersistenceOptions,
} from './types/types';

// Error classes
export {
  NetworkError,
  HttpError,
  RateLimitError,
  NonRetryableError,
  StreamInterruptedError,
  ContextLengthExceededError,
} from './types/types';

// Utility functions
export { calculateBackoff, formatDelay } from './utils/backoff';
export { executeWithRetry, classifyError, RetryOptions, ErrorType } from './utils/retry';
export { extractJson } from './utils/json-extractor';
