import { AIClient } from './ai-client';
import { UsageStats, ProviderConfig } from '../types/types';
import { loadProviders } from '../config/config';
import { extractJson } from '../utils/json-extractor';

// Mock dependencies
jest.mock('../config/config');
jest.mock('../utils/json-extractor');

describe('AIClient', () => {
  // Mock 配置
  const mockProviders: Record<string, ProviderConfig> = {
    anthropic: {
      baseURL: 'https://api.anthropic.com',
      authType: 'apiKey',
      authToken: 'test-key',
      models: ['claude-sonnet-4-20250514'],
    },
  };

  beforeEach(() => {
    // 重置 mocks
    jest.clearAllMocks();
    (loadProviders as jest.Mock).mockReturnValue(mockProviders);
  });

  describe('constructor', () => {
    it('应该加载配置并初始化用量统计', () => {
      const client = new AIClient();

      // 验证配置已加载
      expect(loadProviders).toHaveBeenCalled();

      // 验证用量统计已初始化
      const stats = client.getUsageStats();
      expect(stats).toEqual({
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        byModel: {},
      });
    });

    it('应该接受自定义配置', () => {
      const customProviders: Record<string, ProviderConfig> = {
        custom: {
          baseURL: 'https://custom.api.com',
          authType: 'apiKey',
          authToken: 'custom-key',
          models: ['custom-model'],
        },
      };

      const client = new AIClient({ providers: customProviders });

      // 验证自定义配置已传递给 loadProviders
      expect(loadProviders).toHaveBeenCalledWith({ providers: customProviders });
    });
  });

  describe('extractJson', () => {
    it('应该调用 json-extractor 的 extractJson 函数', () => {
      const mockResult = { key: 'value' };
      (extractJson as jest.Mock).mockReturnValue(mockResult);

      const client = new AIClient();
      const text = '```json\n{"key": "value"}\n```';
      const result = client.extractJson(text);

      // 验证调用了 json-extractor
      expect(extractJson).toHaveBeenCalledWith(text);
      expect(result).toEqual(mockResult);
    });

    it('应该处理空文本', () => {
      (extractJson as jest.Mock).mockReturnValue({});

      const client = new AIClient();
      const result = client.extractJson('');

      expect(extractJson).toHaveBeenCalledWith('');
      expect(result).toEqual({});
    });

    it('应该处理无效 JSON 文本', () => {
      (extractJson as jest.Mock).mockReturnValue({});

      const client = new AIClient();
      const result = client.extractJson('not json at all');

      expect(extractJson).toHaveBeenCalledWith('not json at all');
      expect(result).toEqual({});
    });
  });

  describe('getUsageStats', () => {
    it('应该返回用量统计的副本', () => {
      const client = new AIClient();
      const stats1 = client.getUsageStats();
      const stats2 = client.getUsageStats();

      // 验证返回的是副本，而不是同一个对象
      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });

    it('应该返回当前用量统计', () => {
      const client = new AIClient();
      const stats = client.getUsageStats();

      // 验证初始统计
      expect(stats.totalCalls).toBe(0);
      expect(stats.successCalls).toBe(0);
      expect(stats.failedCalls).toBe(0);
      expect(stats.totalInputTokens).toBe(0);
      expect(stats.totalOutputTokens).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.byModel).toEqual({});
    });
  });

  describe('resetUsageStats', () => {
    it('应该重置用量统计', () => {
      const client = new AIClient();

      // 先获取统计（虽然初始就是 0）
      const initialStats = client.getUsageStats();
      expect(initialStats.totalCalls).toBe(0);

      // 重置统计
      client.resetUsageStats();

      // 验证统计已重置
      const resetStats = client.getUsageStats();
      expect(resetStats).toEqual({
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        byModel: {},
      });
    });
  });

  describe('updateUsageStats (private method)', () => {
    it('应该通过内部方法更新用量统计', () => {
      const client = new AIClient();

      // 使用 any 访问私有方法进行测试
      const clientAny = client as any;

      // 模拟更新用量
      clientAny.updateUsageStats('claude-sonnet-4-20250514', {
        inputTokens: 100,
        outputTokens: 50,
      });

      const stats = client.getUsageStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.totalInputTokens).toBe(100);
      expect(stats.totalOutputTokens).toBe(50);
      expect(stats.totalTokens).toBe(150);
      expect(stats.byModel['claude-sonnet-4-20250514']).toEqual({
        calls: 1,
        inputTokens: 100,
        outputTokens: 50,
      });
    });

    it('应该累积多次调用的用量统计', () => {
      const client = new AIClient();
      const clientAny = client as any;

      // 第一次调用
      clientAny.updateUsageStats('claude-sonnet-4-20250514', {
        inputTokens: 100,
        outputTokens: 50,
      });

      // 第二次调用
      clientAny.updateUsageStats('claude-sonnet-4-20250514', {
        inputTokens: 200,
        outputTokens: 100,
      });

      const stats = client.getUsageStats();
      expect(stats.totalCalls).toBe(2);
      expect(stats.totalInputTokens).toBe(300);
      expect(stats.totalOutputTokens).toBe(150);
      expect(stats.totalTokens).toBe(450);
      expect(stats.byModel['claude-sonnet-4-20250514']).toEqual({
        calls: 2,
        inputTokens: 300,
        outputTokens: 150,
      });
    });

    it('应该分别统计不同模型的用量', () => {
      const client = new AIClient();
      const clientAny = client as any;

      // 模型 1
      clientAny.updateUsageStats('claude-sonnet-4-20250514', {
        inputTokens: 100,
        outputTokens: 50,
      });

      // 模型 2
      clientAny.updateUsageStats('claude-opus-4-20250514', {
        inputTokens: 200,
        outputTokens: 100,
      });

      const stats = client.getUsageStats();
      expect(stats.totalCalls).toBe(2);
      expect(stats.totalInputTokens).toBe(300);
      expect(stats.totalOutputTokens).toBe(150);
      expect(stats.byModel['claude-sonnet-4-20250514']).toEqual({
        calls: 1,
        inputTokens: 100,
        outputTokens: 50,
      });
      expect(stats.byModel['claude-opus-4-20250514']).toEqual({
        calls: 1,
        inputTokens: 200,
        outputTokens: 100,
      });
    });
  });
});
