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
 * 聊天消息
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

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
 * 聊天选项
 */
export interface ChatOptions {
  model?: string;            // 模型标识，支持 "provider/model" 格式
  maxTokens?: number;        // 最大生成 Token 数
  systemPrompt?: string;     // 系统提示词
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
