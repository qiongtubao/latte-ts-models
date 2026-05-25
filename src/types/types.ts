/**
 * 模型配置
 */
export interface ModelConfig {
  useStream?: boolean;          // 是否强制流式模式
  contextWindow?: number;       // 上下文窗口大小
  maxOutputTokens?: number;     // 最大输出 Token
  supportsToolUse?: boolean;    // 是否支持 Tool Use
  timeout?: number;             // 请求超时时间
}

/**
 * JSON Schema property definition
 */
export interface SchemaProperty {
  /** JSON Schema type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null' */
  type: string;
  description?: string;
  enum?: any[];
  items?: SchemaProperty;  // For array type
  properties?: Record<string, SchemaProperty>;  // For object type
  required?: string[];
}

/**
 * Provider 配置
 */
export interface ProviderConfig {
  baseURL: string;                              // API 服务地址
  authToken?: string;                           // 认证令牌
  authType: 'apiKey' | 'authToken';             // 认证方式
  models: string[] | Record<string, ModelConfig>; // 可用模型
  maxTokens?: number;                           // 最大 Token 限制
}

/**
 * 聊天消息（扩展支持 Tool Use）
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];  // 支持字符串或内容块数组
}

/**
 * Text content block
 */
export interface TextBlock {
  type: 'text';
  text: string;
}

/**
 * Tool use content block
 */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;  // Tool call ID for linking to tool_result
  name: string;  // Tool name
  input: Record<string, any>;  // Tool input parameters
}

/**
 * Tool result content (avoiding circular reference)
 */
export type ToolResultContent = TextBlock | ToolUseBlock | string;

/**
 * Tool result content block
 */
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;  // Corresponding tool_use ID
  content: ToolResultContent[] | string;  // Multimodal support
  is_error?: boolean;  // Whether this is an error result
}

/**
 * Content block union type
 */
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

/**
 * Token 用量
 */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  text: string;              // 回复文本
  stopReason: string | null; // 'end_turn' | 'max_tokens' | null
  model: string;             // 实际使用的模型名
  usage?: Usage;             // Token 用量统计
}

/**
 * Tool definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, SchemaProperty>;
    required?: string[];
  };
}

/**
 * 带 Tool Use 的聊天响应
 */
export interface ChatResponseWithTools extends ChatResponse {
  contentBlocks?: ContentBlock[];    // 所有内容块
  toolCalls?: ToolUseBlock[];        // 工具调用列表
}

/**
 * 聊天选项（扩展支持工具）
 */
export interface ChatOptions {
  model?: string;            // 模型标识，支持 "provider/model" 格式
  maxTokens?: number;        // 最大生成 Token 数
  systemPrompt?: string;     // 系统提示词
  tools?: ToolDefinition[];  // 工具列表
  toolChoice?: 'auto' | 'any' | { type: 'tool'; name: string };  // 工具选择策略
}

/**
 * 流事件（扩展版）
 */
export interface StreamEvent {
  type:
    | 'stream_start'      // 流开始
    | 'text'               // 文本增量
    | 'tool_use_start'     // 工具调用开始
    | 'tool_use_input'     // 工具输入增量
    | 'tool_use_end'       // 工具调用完成
    | 'stream_end'         // 流结束
    | 'stream_error';      // 流错误

  delta?: string;              // 文本增量
  toolName?: string;           // 工具名称
  toolId?: string;             // 工具 ID
  partialInput?: any;          // 部分输入
  error?: Error;               // 错误对象
  model?: string;              // 模型名称
  usage?: Usage;                // Token 用量
}

/**
 * Stream event callback function type
 */
export type StreamEventCallback = (event: StreamEvent) => void;

/**
 * Tool executor function with retry context
 */
export type ToolExecutor = (
  name: string,
  input: any,
  context: {
    attempt: number;
    maxRetries: number;
    toolId: string;
  }
) => Promise<any>;

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  isSystemError?: boolean;
}

/**
 * Retry event for onRetry callback
 */
export interface RetryEvent {
  toolName: string;
  toolId: string;
  attempt: number;
  maxRetries: number;
  delay: number;
  error: Error;
}

/**
 * Tool result formatting options
 */
export interface FormatOptions {
  maxErrorLines?: number;   // Max lines for error stacks (default: 10)
  jsonIndent?: number;      // JSON indentation spaces (default: 2)
  useMarkdown?: boolean;    // Wrap JSON in code blocks (default: true)
}

/**
 * 用量统计
 */
export interface UsageStats {
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  byModel: Record<string, {
    calls: number;
    inputTokens: number;
    outputTokens: number;
  }>;
}

/**
 * 日志接口
 */
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * 网络错误（无状态码）
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * HTTP 错误（有状态码）
 */
export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * 限流错误（429）
 */
export class RateLimitError extends HttpError {
  constructor(message: string) {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * 不可重试错误
 */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

/**
 * 流式响应中断错误
 */
export class StreamInterruptedError extends Error {
  public partialResponse: Partial<ChatResponseWithTools>;

  constructor(
    message: string,
    partialResponse: Partial<ChatResponseWithTools>
  ) {
    super(message);
    this.name = 'StreamInterruptedError';
    this.partialResponse = partialResponse;
  }
}

/**
 * 上下文长度超限错误
 */
export class ContextLengthExceededError extends NonRetryableError {
  constructor(message: string) {
    super(message);
    this.name = 'ContextLengthExceededError';
  }
}

/**
 * Tokenizer interface for custom Token counting
 */
export interface Tokenizer {
  estimateTokens(text: string): number;
}

/**
 * Truncation event for the onTruncate hook
 */
export interface TruncateEvent {
  removedMessages: ChatMessage[];  // Messages that were removed
  remainingTokens: number;          // Token count after truncation
}

/**
 * Tool Use 循环状态（细颗粒度）
 */
export type ToolUseLoopState =
  | 'idle'              // 空闲
  | 'thinking'          // 模型思考中
  | 'executing_tools'   // 工具执行中
  | 'processing_results' // 工具结果处理中
  | 'finalizing'        // 强制收尾中
  | 'completed'         // 完成
  | 'failed';           // 失败

/**
 * Tool Use 循环结果状态
 */
export type ToolUseLoopResultStatus =
  | 'completed'         // 正常完成
  | 'max_iterations'    // 达到最大迭代次数
  | 'error';            // 发生错误

/**
 * 循环错误信息结构
 */
export interface ToolUseLoopError {
  code: 'TIMEOUT' | 'MAX_ITERATIONS' | 'TOOL_EXECUTION_FAILED' | 'UNKNOWN';
  message: string;
  originalError?: Error;
}

/**
 * Tool Use 循环选项
 */
export interface ToolUseLoopOptions {
  maxIterations?: number;                              // 最大迭代次数（默认 10）
  forceFinalize?: boolean;                             // 达到上限时强制收尾（默认 true）
  timeout?: number;                                    // 全局超时时间（毫秒，默认 120000）
  onStateChange?: (state: ToolUseLoopState) => void;   // 状态变更回调
  onToolCall?: (toolCall: ToolUseBlock) => void;       // 工具调用回调
  onToolResult?: (result: ToolExecutionResult) => void; // 工具结果回调
  shouldContinue?: (iteration: number, response: ChatResponseWithTools) => boolean;
}

/**
 * Tool Use 循环结果
 */
export interface ToolUseLoopResult {
  status: ToolUseLoopResultStatus;
  response: ChatResponse;
  messages: ChatMessage[];
  iterations: number;
  toolCallsExecuted: number;
  state: ToolUseLoopState;
  error?: ToolUseLoopError;
}

/**
 * 并发执行选项
 */
export interface ParallelExecutionOptions {
  maxConcurrency?: number;                               // 最大并发数（默认 5）
  getResourceKey?: (toolCall: ToolUseBlock) => string | null; // 资源分组键
  isConcurrencySafe?: (toolCall: ToolUseBlock) => boolean; // 是否并发安全
  logger?: Logger;
  onRetry?: (event: RetryEvent) => void;
  onBatchStart?: (batch: ToolUseBlock[]) => void;
  onBatchEnd?: (results: Map<string, ToolExecutionResult>) => void;
}

/**
 * 持久化存储提供者类型
 */
export type PersistenceProvider = 'file' | 'sqlite' | 'indexeddb';

/**
 * 历史持久化选项
 */
export interface HistoryPersistenceOptions {
  provider?: PersistenceProvider;
  filePath?: string;
  autoSave?: boolean;
  autoSaveDelay?: number;
  debounce?: boolean;
  validateData?: boolean;
}
