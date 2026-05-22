import { classifyError, executeWithRetry, RetryOptions } from './retry';
import { NetworkError, HttpError, RateLimitError, NonRetryableError } from '../types/types';

describe('重试逻辑', () => {
  describe('classifyError', () => {
    test('NetworkError 分类为 network', () => {
      const error = new NetworkError('连接失败');
      expect(classifyError(error)).toBe('network');
    });

    test('HttpError 分类为 http', () => {
      const error = new HttpError('服务器错误', 500);
      expect(classifyError(error)).toBe('http');
    });

    test('RateLimitError 分类为 http', () => {
      const error = new RateLimitError('请求过多');
      expect(classifyError(error)).toBe('http');
    });

    test('NonRetryableError 分类为 network', () => {
      const error = new NonRetryableError('不可重试');
      expect(classifyError(error)).toBe('network');
    });

    test('普通 Error 分类为 network', () => {
      const error = new Error('未知错误');
      expect(classifyError(error)).toBe('network');
    });
  });

  describe('executeWithRetry', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('成功执行不重试', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await executeWithRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('网络错误最多重试 3 次', async () => {
      jest.useRealTimers();

      const error = new NetworkError('连接失败');
      let callCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.reject(error);
      });

      await expect(executeWithRetry(fn)).rejects.toThrow('连接失败');
      expect(callCount).toBe(4); // 初始 + 3 次重试

      jest.useFakeTimers();
    });

    test('网络错误重试成功后返回结果', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new NetworkError('连接失败'))
        .mockRejectedValueOnce(new NetworkError('连接失败'))
        .mockResolvedValue('success');

      const promise = executeWithRetry(fn);
      await jest.runAllTimersAsync();

      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3); // 初始 + 2 次重试
    });

    test('HTTP 错误重试次数正确', async () => {
      // 验证 HTTP 错误会按照正确的次数重试
      const error = new HttpError('服务器错误', 500);
      let callCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        callCount++;
        // 在第 5 次调用后成功
        if (callCount >= 5) {
          return Promise.resolve('success');
        }
        return Promise.reject(error);
      });

      const promise = executeWithRetry(fn);

      // 快进定时器
      await jest.runAllTimersAsync();

      const result = await promise;
      expect(result).toBe('success');
      expect(callCount).toBe(5); // 前 4 次失败 + 1 次成功

      // 验证 HTTP 错误可以重试更多次（相比于网络错误）
      const error2 = new HttpError('服务器错误', 500);
      let callCount2 = 0;
      const fn2 = jest.fn().mockImplementation(() => {
        callCount2++;
        // 在第 15 次调用后成功
        if (callCount2 >= 15) {
          return Promise.resolve('success');
        }
        return Promise.reject(error2);
      });

      const promise2 = executeWithRetry(fn2);
      await jest.runAllTimersAsync();

      const result2 = await promise2;
      expect(result2).toBe('success');
      expect(callCount2).toBe(15);
    });

    test('HTTP 错误重试成功后返回结果', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new HttpError('服务器错误', 500))
        .mockRejectedValueOnce(new HttpError('服务器错误', 500))
        .mockResolvedValue('success');

      const promise = executeWithRetry(fn);
      await jest.runAllTimersAsync();

      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('NonRetryableError 不重试', async () => {
      jest.useRealTimers();

      const error = new NonRetryableError('不可重试');
      let callCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.reject(error);
      });

      await expect(executeWithRetry(fn)).rejects.toThrow('不可重试');
      expect(callCount).toBe(1);

      jest.useFakeTimers();
    });

    test('自定义最大重试次数', async () => {
      jest.useRealTimers();

      const options: RetryOptions = {
        maxRetries: {
          network: 1,
          http: 2
        }
      };

      const error = new NetworkError('连接失败');
      let callCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.reject(error);
      });

      await expect(executeWithRetry(fn, options)).rejects.toThrow('连接失败');
      expect(callCount).toBe(2); // 初始 + 1 次重试

      jest.useFakeTimers();
    });

    test('使用退避延迟', async () => {
      const error = new NetworkError('连接失败');
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      // 开始执行
      const promise = executeWithRetry(fn);

      // 等待第一个错误发生，此时应该设置了定时器
      await Promise.resolve();
      await Promise.resolve();

      // 检查是否设置了定时器（退避延迟）
      expect(jest.getTimerCount()).toBeGreaterThan(0);

      await jest.runAllTimersAsync();
      const result = await promise;
      expect(result).toBe('success');
    });

    test('传递参数给函数', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await executeWithRetry(() => fn('arg1', 'arg2'));
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });
});
