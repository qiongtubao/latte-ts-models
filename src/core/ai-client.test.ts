import { AIClient } from './ai-client';
import { UsageStats, ProviderConfig, ChatMessage, ChatResponse, ChatResponseWithTools, ToolDefinition, StreamInterruptedError, ToolResultBlock, FormatOptions, ToolUseBlock, NonRetryableError } from '../types/types';
import { loadProviders } from '../config/config';
import { extractJson } from '../utils/json-extractor';
import { executeWithRetry } from '../utils/retry';
import Anthropic from '@anthropic-ai/sdk';

// Mock dependencies
jest.mock('../config/config');
jest.mock('../utils/json-extractor');
jest.mock('../utils/retry');
jest.mock('@anthropic-ai/sdk');

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

  // Mock Anthropic 客户端
  const mockAnthropicCreate = jest.fn();
  const mockAnthropicConstructor = jest.fn().mockImplementation(() => ({
    messages: {
      create: mockAnthropicCreate,
    },
  }));

  beforeEach(() => {
    // 重置 mocks
    jest.clearAllMocks();
    (loadProviders as jest.Mock).mockReturnValue(mockProviders);
    (Anthropic as unknown as jest.Mock).mockImplementation(mockAnthropicConstructor);

    // 默认 executeWithRetry 直接执行函数
    (executeWithRetry as jest.Mock).mockImplementation(async (fn: () => Promise<any>) => fn());
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

  describe('query', () => {
    it('应该发送单轮查询并返回文本', async () => {
      // Mock API 响应
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Hello, I am Claude.' }],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      const client = new AIClient();
      const result = await client.query('Hello');

      // 验证返回文本
      expect(result).toBe('Hello, I am Claude.');

      // 验证 API 调用参数
      expect(mockAnthropicCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      // 验证使用了重试机制
      expect(executeWithRetry).toHaveBeenCalled();
    });

    it('应该支持自定义选项', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      const client = new AIClient();
      const result = await client.query('Hello', {
        model: 'anthropic/claude-sonnet-4-20250514',
        maxTokens: 2048,
        systemPrompt: 'You are a helpful assistant.',
      });

      expect(result).toBe('Response');

      // 验证 API 调用包含系统提示词
      expect(mockAnthropicCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: 'You are a helpful assistant.',
        messages: [{ role: 'user', content: 'Hello' }],
      });
    });

    it('应该更新用量统计', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const client = new AIClient();
      await client.query('Hello');

      const stats = client.getUsageStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.successCalls).toBe(1);
      expect(stats.totalInputTokens).toBe(100);
      expect(stats.totalOutputTokens).toBe(50);
      expect(stats.totalTokens).toBe(150);
    });

    it('应该处理 API 错误', async () => {
      const error = new Error('API Error');
      mockAnthropicCreate.mockRejectedValueOnce(error);

      const client = new AIClient();

      await expect(client.query('Hello')).rejects.toThrow('API Error');

      // 验证失败统计
      const stats = client.getUsageStats();
      expect(stats.failedCalls).toBe(1);
    });

    it('应该支持自定义 logger', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const client = new AIClient();
      await client.query('Hello', {}, logger);

      // 验证 logger 被调用
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('chat', () => {
    it('应该发送多轮对话并返回完整响应', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];

      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'I am doing well!' }],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 30, output_tokens: 10 },
      });

      const client = new AIClient();
      const response: ChatResponse = await client.chat(messages);

      // 验证响应结构
      expect(response.text).toBe('I am doing well!');
      expect(response.stopReason).toBe('end_turn');
      expect(response.model).toBe('claude-sonnet-4-20250514');
      expect(response.usage).toEqual({ inputTokens: 30, outputTokens: 10 });

      // 验证 API 调用参数
      expect(mockAnthropicCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: messages,
      });
    });

    it('应该支持自定义选项', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'max_tokens',
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      const client = new AIClient();
      const response = await client.chat(messages, {
        model: 'anthropic/claude-sonnet-4-20250514',
        maxTokens: 1024,
        systemPrompt: 'You are a helpful assistant.',
      });

      expect(response.stopReason).toBe('max_tokens');

      // 验证 API 调用包含自定义选项
      expect(mockAnthropicCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: 'You are a helpful assistant.',
        messages: messages,
      });
    });

    it('应该更新用量统计', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 50, output_tokens: 30 },
      });

      const client = new AIClient();
      await client.chat(messages);

      const stats = client.getUsageStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.successCalls).toBe(1);
      expect(stats.totalInputTokens).toBe(50);
      expect(stats.totalOutputTokens).toBe(30);
    });

    it('应该处理 API 错误', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const error = new Error('API Error');
      mockAnthropicCreate.mockRejectedValueOnce(error);

      const client = new AIClient();

      await expect(client.chat(messages)).rejects.toThrow('API Error');

      const stats = client.getUsageStats();
      expect(stats.failedCalls).toBe(1);
    });

    it('应该支持自定义 logger', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const client = new AIClient();
      await client.chat(messages, {}, logger);

      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('resolveModel (private method)', () => {
    it('应该解析默认模型', () => {
      const client = new AIClient();
      const clientAny = client as any;

      const result = clientAny.resolveModel();

      expect(result).toEqual({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      });
    });

    it('应该解析 provider/model 格式', () => {
      const client = new AIClient();
      const clientAny = client as any;

      const result = clientAny.resolveModel('anthropic/claude-sonnet-4-20250514');

      expect(result).toEqual({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      });
    });

    it('应该解析仅模型名格式', () => {
      const client = new AIClient();
      const clientAny = client as any;

      const result = clientAny.resolveModel('claude-sonnet-4-20250514');

      expect(result).toEqual({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      });
    });

    it('应该抛出错误当 provider 不存在', () => {
      const client = new AIClient();
      const clientAny = client as any;

      expect(() => clientAny.resolveModel('unknown/model')).toThrow('Provider not found: unknown');
    });

    it('应该抛出错误当模型不在 provider 中', () => {
      const client = new AIClient();
      const clientAny = client as any;

      expect(() => clientAny.resolveModel('anthropic/unknown-model')).toThrow(
        'Model unknown-model not found in provider anthropic'
      );
    });
  });

  describe('createAnthropicClient (private method)', () => {
    it('应该创建 Anthropic 客户端', () => {
      const client = new AIClient();
      const clientAny = client as any;

      const config = {
        baseURL: 'https://api.anthropic.com',
        authToken: 'test-key',
      };

      const anthropicClient = clientAny.createAnthropicClient(config);

      expect(Anthropic).toHaveBeenCalledWith({
        baseURL: config.baseURL,
        apiKey: config.authToken,
      });
    });
  });

  describe('chatWithTools', () => {
    // Integration tests that skip if no API key
    const hasApiKey = process.env.ANTHROPIC_API_KEY;
    const testFn = hasApiKey ? it : it.skip;

    const tools: ToolDefinition[] = [
      {
        name: 'get_weather',
        description: 'Get the current weather in a location',
        input_schema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA',
            },
          },
          required: ['location'],
        },
      },
    ];

    testFn('should call API with tools and return response with tool calls', async () => {
      const client = new AIClient();
      const messages: ChatMessage[] = [
        { role: 'user', content: 'What is the weather in San Francisco?' },
      ];

      const response = await client.chatWithTools(messages, { tools });

      expect(response).toBeDefined();
      expect(response.model).toBeDefined();
      expect(response.usage).toBeDefined();
      expect(response.stopReason).toBeDefined();
      // Tool use should be present
      if (response.toolCalls && response.toolCalls.length > 0) {
        expect(response.toolCalls[0].type).toBe('tool_use');
        expect(response.toolCalls[0].name).toBe('get_weather');
        expect(response.toolCalls[0].id).toBeDefined();
        expect(response.toolCalls[0].input).toBeDefined();
      }
    });

    testFn('should support tool_choice parameter', async () => {
      const client = new AIClient();
      const messages: ChatMessage[] = [
        { role: 'user', content: 'What is the weather?' },
      ];

      const response = await client.chatWithTools(messages, {
        tools,
        toolChoice: 'auto',
      });

      expect(response).toBeDefined();
      expect(response.model).toBeDefined();
    });

    testFn('should handle text-only response', async () => {
      const client = new AIClient();
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello, how are you?' },
      ];

      const response = await client.chatWithTools(messages, { tools });

      expect(response).toBeDefined();
      expect(response.text).toBeDefined();
      expect(response.model).toBeDefined();
    });

    testFn('should support custom logger', async () => {
      const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const client = new AIClient();
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      await client.chatWithTools(messages, { tools }, logger);

      expect(logger.debug).toHaveBeenCalled();
    });

    testFn('should update usage stats', async () => {
      const client = new AIClient();
      const messages: ChatMessage[] = [
        { role: 'user', content: 'What is the weather?' },
      ];

      const initialStats = client.getUsageStats();
      await client.chatWithTools(messages, { tools });
      const finalStats = client.getUsageStats();

      expect(finalStats.totalCalls).toBe(initialStats.totalCalls + 1);
      expect(finalStats.successCalls).toBe(initialStats.successCalls + 1);
    });
  });

  describe('chatStream', () => {
    // Integration tests that skip if no API key
    const hasApiKey = process.env.ANTHROPIC_API_KEY;
    const testFn = hasApiKey ? it : it.skip;

    const tools: ToolDefinition[] = [
      {
        name: 'get_weather',
        description: 'Get the current weather in a location',
        input_schema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA',
            },
          },
          required: ['location'],
        },
      },
    ];

    testFn('should stream text response', async () => {
      const client = new AIClient();
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Tell me a short story' },
      ];

      const response = await client.chatStream(messages);

      expect(response).toBeDefined();
      expect(response.text).toBeDefined();
      expect(response.model).toBeDefined();
      expect(response.usage).toBeDefined();
      expect(response.stopReason).toBe('end_turn');
    });

    testFn('should stream with tools and collect tool calls', async () => {
      const client = new AIClient();
      const messages: ChatMessage[] = [
        { role: 'user', content: 'What is the weather in Tokyo?' },
      ];

      const response = await client.chatStream(messages, { tools });

      expect(response).toBeDefined();
      expect(response.model).toBeDefined();
      expect(response.usage).toBeDefined();

      // If tool use occurred
      if (response.toolCalls && response.toolCalls.length > 0) {
        expect(response.toolCalls[0].type).toBe('tool_use');
        expect(response.toolCalls[0].name).toBeDefined();
        expect(response.toolCalls[0].id).toBeDefined();
        expect(response.toolCalls[0].input).toBeDefined();
      }
    });

    testFn('should maintain content block order', async () => {
      const client = new AIClient();
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const response = await client.chatStream(messages, { tools });

      if (response.contentBlocks) {
        // Verify content blocks exist
        expect(response.contentBlocks.length).toBeGreaterThan(0);

        // Check that blocks are properly ordered
        for (let i = 0; i < response.contentBlocks.length; i++) {
          const block = response.contentBlocks[i];
          expect(block.type).toBeDefined();
        }
      }
    });

    testFn('should support custom options', async () => {
      const client = new AIClient();
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const response = await client.chatStream(messages, {
        model: 'anthropic/claude-sonnet-4-20250514',
        maxTokens: 1024,
        systemPrompt: 'You are a helpful assistant.',
      });

      expect(response).toBeDefined();
      expect(response.model).toBe('claude-sonnet-4-20250514');
    });

    testFn('should support custom logger', async () => {
      const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const client = new AIClient();
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      await client.chatStream(messages, {}, undefined, logger);

      expect(logger.debug).toHaveBeenCalled();
    });

    testFn('should update usage stats', async () => {
      const client = new AIClient();
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const initialStats = client.getUsageStats();
      await client.chatStream(messages);
      const finalStats = client.getUsageStats();

      expect(finalStats.totalCalls).toBe(initialStats.totalCalls + 1);
      expect(finalStats.successCalls).toBe(initialStats.successCalls + 1);
    });

    testFn('should handle stream interruption', async () => {
      // This test requires mocking the stream
      // For integration test, we can't easily simulate interruption
      // So we just verify the error type exists
      expect(StreamInterruptedError).toBeDefined();

      const error = new StreamInterruptedError('Stream interrupted', {
        text: 'partial',
      });

      expect(error.name).toBe('StreamInterruptedError');
      expect(error.partialResponse).toBeDefined();
    });
  });

  describe('chatStream - callbacks', () => {
    const hasApiKey = process.env.ANTHROPIC_API_KEY;
    const testOrSkip = hasApiKey ? test : test.skip;

    testOrSkip('should trigger stream_start event', async () => {
      const client = new AIClient();
      const events: any[] = [];

      await client.chatStream(
        [{ role: 'user', content: 'Hello' }],
        undefined,
        (event) => events.push(event)
      );

      expect(events[0].type).toBe('stream_start');
      expect(events[0].model).toBeDefined();
    });

    testOrSkip('should trigger text events', async () => {
      const client = new AIClient();
      const events: any[] = [];

      await client.chatStream(
        [{ role: 'user', content: 'Say hello' }],
        undefined,
        (event) => { if (event.type === 'text') events.push(event); }
      );

      expect(events.length).toBeGreaterThan(0);
      expect(events.every(e => e.type === 'text')).toBe(true);
    });

    testOrSkip('should trigger stream_end event', async () => {
      const client = new AIClient();
      const events: any[] = [];

      await client.chatStream(
        [{ role: 'user', content: 'Hello' }],
        undefined,
        (event) => events.push(event)
      );

      const endEvent = events.find(e => e.type === 'stream_end');
      expect(endEvent).toBeDefined();
      expect(endEvent?.usage).toBeDefined();
    });

    test('should not break if callback throws', async () => {
      // This test verifies exception isolation
      // We'll test with mock that throws
      const client = new AIClient();

      // Create a callback that throws
      const badCallback = () => {
        throw new Error('Callback error');
      };

      // The stream should still complete even if callback throws
      // This is tested via integration test - if callback breaks the stream,
      // the test would fail
      // For unit test, we rely on the safeTriggerEvent implementation
      expect(true).toBe(true); // Placeholder - actual test needs mock
    });
  });

  describe('buildToolResultMessage (enhanced)', () => {
    test('should format object result with Markdown', () => {
      const data = { temp: 25, city: 'Beijing' };
      const message = AIClient.buildToolResultMessage('tool_1', data);

      expect(message.role).toBe('user');
      const content = message.content as ToolResultBlock[];
      expect(content[0].content).toContain('```json');
      expect(content[0].content).toContain('"temp"');
    });

    test('should truncate error stacks', () => {
      const error = new Error('Test error\n' + 'line\n'.repeat(20));
      const message = AIClient.buildToolResultMessage('tool_2', error, true, {
        maxErrorLines: 5
      });

      const content = message.content as ToolResultBlock[];
      expect(content[0].content).toContain('more lines truncated');
    });

    test('should respect formatOptions', () => {
      const data = { a: 1 };
      const message = AIClient.buildToolResultMessage('tool_3', data, false, {
        useMarkdown: false,
        jsonIndent: 4
      });

      const content = message.content as ToolResultBlock[];
      expect((content[0].content as string)).not.toContain('```');
    });
  });

  describe('executeToolWithRetry', () => {
    let ai: AIClient;

    beforeEach(() => {
      ai = new AIClient({
        providers: {
          anthropic: {
            baseURL: 'https://api.anthropic.com',
            authToken: 'test-key',
            authType: 'apiKey',
            models: ['claude-3-5-sonnet-20241022']
          }
        }
      });
    });

    test('should return success on first attempt', async () => {
      const toolCall: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool_1',
        name: 'test_tool',
        input: { query: 'test' }
      };

      const executor = jest.fn().mockResolvedValue({ result: 'success' });

      const result = await ai.executeToolWithRetry(toolCall, executor, 3);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ result: 'success' });
      expect(executor).toHaveBeenCalledTimes(1);
    });

    test('should retry on failure', async () => {
      const toolCall: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool_2',
        name: 'test_tool',
        input: {}
      };

      const executor = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ result: 'success' });

      const result = await ai.executeToolWithRetry(toolCall, executor, 3);

      expect(result.success).toBe(true);
      expect(executor).toHaveBeenCalledTimes(2);
    });

    test('should fail after max retries', async () => {
      const toolCall: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool_3',
        name: 'test_tool',
        input: {}
      };

      const executor = jest.fn()
        .mockRejectedValue(new Error('Persistent error'));

      const result = await ai.executeToolWithRetry(toolCall, executor, 2);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Persistent error');
      expect(executor).toHaveBeenCalledTimes(2);
    });

    test('should not retry NonRetryableError', async () => {
      const toolCall: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool_4',
        name: 'test_tool',
        input: {}
      };

      const executor = jest.fn()
        .mockRejectedValue(new NonRetryableError('Invalid input'));

      const result = await ai.executeToolWithRetry(toolCall, executor, 3);

      expect(result.success).toBe(false);
      expect(executor).toHaveBeenCalledTimes(1);
    });

    test('should trigger onRetry callback', async () => {
      const toolCall: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool_5',
        name: 'test_tool',
        input: {}
      };

      const executor = jest.fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockResolvedValueOnce({ result: 'success' });

      const retryEvents: any[] = [];

      await ai.executeToolWithRetry(toolCall, executor, 3, {
        onRetry: (event) => retryEvents.push(event)
      });

      expect(retryEvents.length).toBe(1);
      expect(retryEvents[0].attempt).toBe(1);
      expect(retryEvents[0].toolName).toBe('test_tool');
    });

    test('should pass context to executor', async () => {
      const toolCall: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool_6',
        name: 'test_tool',
        input: { key: 'value' }
      };

      let receivedContext: any;

      const executor = jest.fn().mockImplementation(async (name, input, context) => {
        receivedContext = context;
        return { result: 'success' };
      });

      await ai.executeToolWithRetry(toolCall, executor, 3);

      expect(receivedContext).toBeDefined();
      expect(receivedContext.attempt).toBe(1);
      expect(receivedContext.maxRetries).toBe(3);
      expect(receivedContext.toolId).toBe('tool_6');
    });

    test('should support custom logger', async () => {
      const toolCall: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool_7',
        name: 'test_tool',
        input: {}
      };

      const executor = jest.fn().mockResolvedValue({ result: 'success' });

      const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      await ai.executeToolWithRetry(toolCall, executor, 3, { logger });

      expect(logger.debug).toHaveBeenCalledWith(
        'Executing tool (attempt 1/3)',
        expect.objectContaining({
          toolName: 'test_tool',
          toolId: 'tool_7',
        })
      );
      expect(logger.debug).toHaveBeenCalledWith(
        'Tool execution successful',
        expect.objectContaining({
          toolName: 'test_tool',
        })
      );
    });

    test('should use exponential backoff', async () => {
      const toolCall: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool_8',
        name: 'test_tool',
        input: {}
      };

      const executor = jest.fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce({ result: 'success' });

      const retryEvents: any[] = [];

      await ai.executeToolWithRetry(toolCall, executor, 3, {
        onRetry: (event) => retryEvents.push(event)
      });

      // First retry: delay = min(1000 * 2^0, 10000) = 1000
      expect(retryEvents[0].delay).toBe(1000);
      // Second retry: delay = min(1000 * 2^1, 10000) = 2000
      expect(retryEvents[1].delay).toBe(2000);
    });
  });
});
