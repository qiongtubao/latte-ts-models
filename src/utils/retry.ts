import { NetworkError, HttpError, NonRetryableError } from '../types/types';
import { calculateBackoff } from './backoff';

/**
 * 错误类型分类
 */
export type ErrorType = 'network' | 'http';

/**
 * 重试配置选项
 */
export interface RetryOptions {
  maxRetries?: {
    network?: number;  // 网络错误最大重试次数，默认 3
    http?: number;     // HTTP 错误最大重试次数，默认 20
  };
}

/**
 * 默认重试配置
 */
const DEFAULT_MAX_RETRIES = {
  network: 3,
  http: 20
};

/**
 * 分类错误类型
 *
 * @param error - 错误对象
 * @returns 错误类型：'network' 或 'http'
 *
 * 分类规则：
 * - NetworkError -> 'network'
 * - HttpError 及其子类 -> 'http'
 * - 其他错误 -> 'network'
 */
export function classifyError(error: Error): ErrorType {
  // NetworkError 分类为 network
  if (error instanceof NetworkError) {
    return 'network';
  }

  // HttpError 及其子类（RateLimitError, NonRetryableError）分类为 http
  if (error instanceof HttpError) {
    return 'http';
  }

  // 其他错误默认为 network
  return 'network';
}

/**
 * 使用重试机制执行异步函数
 *
 * @param fn - 要执行的异步函数
 * @param options - 重试配置选项
 * @returns 函数执行结果
 * @throws 当所有重试失败后抛出最后一个错误
 *
 * 重试策略：
 * - 网络错误：最多重试 3 次
 * - HTTP 错误：最多重试 20 次
 * - NonRetryableError：不重试
 * - 使用指数退避延迟
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  // 合并配置
  const maxRetries = {
    network: options?.maxRetries?.network ?? DEFAULT_MAX_RETRIES.network,
    http: options?.maxRetries?.http ?? DEFAULT_MAX_RETRIES.http
  };

  let lastError: Error | null = null;
  let retryCount = 0;

  while (true) {
    try {
      // 尝试执行函数
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // NonRetryableError 不重试
      if (error instanceof NonRetryableError) {
        throw error;
      }

      // 分类错误类型
      const errorType = classifyError(error as Error);
      const maxRetryCount = maxRetries[errorType];

      // 检查是否已达到最大重试次数
      if (retryCount >= maxRetryCount) {
        throw error;
      }

      // 计算退避延迟
      const delay = calculateBackoff(retryCount);

      // 等待后重试
      await new Promise<void>(resolve => {
        setTimeout(resolve, delay);
      });

      retryCount++;
    }
  }
}
