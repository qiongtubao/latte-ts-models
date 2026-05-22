import {
  ProviderConfig,
  ModelConfig,
  ChatMessage,
  ChatResponse,
  ChatOptions,
  Usage,
  UsageStats,
  Logger,
  NetworkError,
  HttpError,
  RateLimitError,
  NonRetryableError,
} from './types';

describe('类型定义', () => {
  describe('核心类型', () => {
    test('ProviderConfig 接口定义正确', () => {
      const config: ProviderConfig = {
        baseURL: 'https://api.example.com',
        authType: 'apiKey',
        models: ['model-1', 'model-2'],
      };
      expect(config.baseURL).toBe('https://api.example.com');
    });

    test('ProviderConfig 支持 models 为对象', () => {
      const config: ProviderConfig = {
        baseURL: 'https://api.example.com',
        authType: 'authToken',
        models: {
          'model-1': { useStream: true },
        },
      };
      expect(config.models).toBeDefined();
    });

    test('ModelConfig 所有字段可选', () => {
      const config: ModelConfig = {};
      expect(config).toBeDefined();
    });

    test('ChatMessage 包含 role 和 content', () => {
      const message: ChatMessage = {
        role: 'user',
        content: 'Hello',
      };
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello');
    });

    test('ChatResponse 包含必需字段', () => {
      const response: ChatResponse = {
        text: 'Response text',
        stopReason: 'end_turn',
        model: 'claude-sonnet-4-20250514',
        usage: {
          inputTokens: 10,
          outputTokens: 20,
        },
      };
      expect(response.text).toBe('Response text');
      expect(response.usage?.inputTokens).toBe(10);
    });

    test('ChatOptions 所有字段可选', () => {
      const options: ChatOptions = {};
      expect(options).toBeDefined();
    });

    test('Usage 包含 inputTokens 和 outputTokens', () => {
      const usage: Usage = {
        inputTokens: 100,
        outputTokens: 200,
      };
      expect(usage.inputTokens).toBe(100);
      expect(usage.outputTokens).toBe(200);
    });

    test('UsageStats 包含所有统计字段', () => {
      const stats: UsageStats = {
        totalCalls: 10,
        successCalls: 8,
        failedCalls: 2,
        totalInputTokens: 1000,
        totalOutputTokens: 2000,
        totalTokens: 3000,
        byModel: {
          'model-1': {
            calls: 5,
            inputTokens: 500,
            outputTokens: 1000,
          },
        },
      };
      expect(stats.totalCalls).toBe(10);
      expect(stats.byModel['model-1'].calls).toBe(5);
    });

    test('Logger 接口定义正确', () => {
      const logger: Logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      expect(logger.debug).toBeDefined();
    });
  });

  describe('错误类型', () => {
    test('NetworkError 继承 Error', () => {
      const error = new NetworkError('Connection failed');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NetworkError');
      expect(error.message).toBe('Connection failed');
    });

    test('HttpError 包含 status 字段', () => {
      const error = new HttpError('Not found', 404);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('HttpError');
      expect(error.status).toBe(404);
    });

    test('RateLimitError 继承 HttpError 且 status 为 429', () => {
      const error = new RateLimitError('Too many requests');
      expect(error).toBeInstanceOf(HttpError);
      expect(error.name).toBe('RateLimitError');
      expect(error.status).toBe(429);
    });

    test('NonRetryableError 继承 Error', () => {
      const error = new NonRetryableError('Invalid request');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NonRetryableError');
    });
  });

  describe('noopLogger', () => {
    test('noopLogger 不抛错', () => {
      // noopLogger 应该是一个静默的日志实现
      expect(() => {
        const noopLogger: Logger = {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        };
        noopLogger.debug('test');
        noopLogger.info('test');
        noopLogger.warn('test');
        noopLogger.error('test');
      }).not.toThrow();
    });
  });
});
