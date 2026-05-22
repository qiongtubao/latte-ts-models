// Main client
export { AIClient, AIClientOptions } from './core/ai-client';

// Types
export type {
  ProviderConfig,
  ModelConfig,
  ChatMessage,
  ChatResponse,
  ChatOptions,
  Usage,
  UsageStats,
  Logger,
} from './types/types';

// Error classes
export {
  NetworkError,
  HttpError,
  RateLimitError,
  NonRetryableError,
} from './types/types';

// Utility functions
export { calculateBackoff, formatDelay } from './utils/backoff';
export { executeWithRetry, classifyError, RetryOptions, ErrorType } from './utils/retry';
export { extractJson } from './utils/json-extractor';
