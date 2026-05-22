/**
 * 计算指数退避延迟
 *
 * @param n - 重试次数（从 0 开始）
 * @returns 延迟毫秒数
 *
 * 算法: delay = 500ms * 2^n + jitter(0-99ms)
 * 上限: 24小时 = 86,400,000ms
 */
export function calculateBackoff(n: number): number {
  const baseDelay = 500;
  const maxDelay = 86_400_000; // 24 小时
  const jitter = Math.floor(Math.random() * 100);

  // 处理负数和小数
  const exponent = Math.max(0, Math.floor(n));
  const delay = baseDelay * Math.pow(2, exponent) + jitter;
  return Math.min(delay, maxDelay);
}

/**
 * 格式化延迟时间用于日志输出
 *
 * @param ms - 毫秒数
 * @returns 格式化后的时间字符串
 */
export function formatDelay(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else if (ms < 3600000) {
    return `${(ms / 60000).toFixed(1)}min`;
  } else {
    return `${(ms / 3600000).toFixed(1)}h`;
  }
}
