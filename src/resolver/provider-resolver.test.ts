import {
  parseModelRef,
  isModelAvailable,
  findProviderConfig,
  resolveProvider,
  guessDefaultProvider,
} from './provider-resolver';
import type { ProviderConfig } from '../types/types';

describe('provider-resolver', () => {
  // 测试数据
  const mockProviders: Record<string, ProviderConfig> = {
    openai: {
      baseURL: 'https://api.openai.com/v1',
      authType: 'apiKey',
      models: ['gpt-4', 'gpt-3.5-turbo'],
    },
    anthropic: {
      baseURL: 'https://api.anthropic.com/v1',
      authType: 'apiKey',
      models: {
        'claude-3-opus': { contextWindow: 200000 },
        'claude-3-sonnet': { contextWindow: 180000 },
      },
    },
    deepseek: {
      baseURL: 'https://api.deepseek.com/v1',
      authType: 'apiKey',
      models: ['deepseek-chat', 'deepseek-coder'],
    },
  };

  describe('parseModelRef', () => {
    test('应该解析 "provider/model" 格式', () => {
      const result = parseModelRef('openai/gpt-4');
      expect(result).toEqual({
        providerName: 'openai',
        modelName: 'gpt-4',
      });
    });

    test('应该解析 "model" 格式（无 provider）', () => {
      const result = parseModelRef('gpt-4');
      expect(result).toEqual({
        providerName: undefined,
        modelName: 'gpt-4',
      });
    });

    test('应该处理包含斜杠的模型名', () => {
      const result = parseModelRef('provider/model/name');
      expect(result).toEqual({
        providerName: 'provider',
        modelName: 'model/name',
      });
    });

    test('应该处理空字符串', () => {
      const result = parseModelRef('');
      expect(result).toEqual({
        providerName: undefined,
        modelName: '',
      });
    });
  });

  describe('isModelAvailable', () => {
    it('应该在数组格式中找到模型', () => {
      const models = ['gpt-4', 'gpt-3.5-turbo'];
      expect(isModelAvailable(models, 'gpt-4')).toBe(true);
      expect(isModelAvailable(models, 'gpt-3.5-turbo')).toBe(true);
      expect(isModelAvailable(models, 'unknown')).toBe(false);
    });

    it('应该在 Record 格式中找到模型', () => {
      const models = {
        'claude-3-opus': { contextWindow: 200000 },
        'claude-3-sonnet': { contextWindow: 180000 },
      };
      expect(isModelAvailable(models, 'claude-3-opus')).toBe(true);
      expect(isModelAvailable(models, 'claude-3-sonnet')).toBe(true);
      expect(isModelAvailable(models, 'unknown')).toBe(false);
    });

    it('应该处理空数组', () => {
      expect(isModelAvailable([], 'gpt-4')).toBe(false);
    });

    it('应该处理空对象', () => {
      expect(isModelAvailable({}, 'gpt-4')).toBe(false);
    });
  });

  describe('findProviderConfig', () => {
    it('应该找到指定 provider 的配置', () => {
      const result = findProviderConfig(mockProviders, 'openai');
      expect(result).toBe(mockProviders.openai);
    });

    it('应该返回 undefined 如果 provider 不存在', () => {
      const result = findProviderConfig(mockProviders, 'unknown');
      expect(result).toBeUndefined();
    });

    it('应该在指定 provider 中找到模型', () => {
      const result = findProviderConfig(mockProviders, 'openai', 'gpt-4');
      expect(result).toBe(mockProviders.openai);
    });

    it('应该返回 undefined 如果模型不在指定 provider 中', () => {
      const result = findProviderConfig(mockProviders, 'openai', 'claude-3-opus');
      expect(result).toBeUndefined();
    });

    it('应该在没有指定模型名时返回 provider 配置', () => {
      const result = findProviderConfig(mockProviders, 'anthropic');
      expect(result).toBe(mockProviders.anthropic);
    });
  });

  describe('resolveProvider', () => {
    it('应该解析 "provider/model" 格式', () => {
      const result = resolveProvider('openai/gpt-4', mockProviders);
      expect(result).toEqual({
        providerName: 'openai',
        modelName: 'gpt-4',
        config: mockProviders.openai,
      });
    });

    it('应该使用默认 provider 解析 "model" 格式', () => {
      const result = resolveProvider('gpt-4', mockProviders, 'openai');
      expect(result).toEqual({
        providerName: 'openai',
        modelName: 'gpt-4',
        config: mockProviders.openai,
      });
    });

    it('应该在没有默认 provider 时推断', () => {
      const result = resolveProvider('gpt-4', mockProviders);
      expect(result).toEqual({
        providerName: 'openai',
        modelName: 'gpt-4',
        config: mockProviders.openai,
      });
    });

    it('应该抛出错误如果 provider 不存在', () => {
      expect(() => {
        resolveProvider('unknown/model', mockProviders);
      }).toThrow('Provider "unknown" 不存在');
    });

    it('应该抛出错误如果模型不可用', () => {
      expect(() => {
        resolveProvider('openai/unknown', mockProviders);
      }).toThrow('模型 "unknown" 在 provider "openai" 中不可用');
    });

    it('应该抛出错误如果无法推断 provider', () => {
      expect(() => {
        resolveProvider('unknown-model', {});
      }).toThrow('无法找到包含模型 "unknown-model" 的 provider');
    });

    it('应该抛出错误如果模型在默认 provider 中不可用', () => {
      expect(() => {
        resolveProvider('claude-3-opus', mockProviders, 'openai');
      }).toThrow('模型 "claude-3-opus" 在 provider "openai" 中不可用');
    });
  });

  describe('guessDefaultProvider', () => {
    it('应该返回第一个 provider', () => {
      const result = guessDefaultProvider(mockProviders);
      expect(result).toBe('openai');
    });

    it('应该返回 undefined 如果没有 providers', () => {
      const result = guessDefaultProvider({});
      expect(result).toBeUndefined();
    });

    it('应该处理单个 provider', () => {
      const singleProvider = { openai: mockProviders.openai };
      const result = guessDefaultProvider(singleProvider);
      expect(result).toBe('openai');
    });
  });
});
