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
 * 流事件
 */
export interface StreamEvent {
  type: 'text' | 'tool_use_start' | 'tool_use_input' | 'tool_use_end' | 'tool_result' | 'message_stop';
  delta?: string;              // 文本增量
  toolName?: string;           // 工具名称
  toolId?: string;             // 工具 ID
  partialInput?: any;          // 部分输入
  result?: string | ToolResultContent[];  // 工具结果
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
