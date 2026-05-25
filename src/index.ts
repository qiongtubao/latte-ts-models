// Main client
export { AIClient, AIClientOptions } from './core/ai-client';

// New class
export { ChatHistory } from './core/chat-history';

// Types
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
export { formatToolResult, truncateErrorStack } from './utils/tool-result-formatter';
