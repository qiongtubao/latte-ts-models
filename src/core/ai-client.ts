import { UsageStats, Usage, ProviderConfig, ChatMessage, ChatResponse, ChatOptions, Logger } from '../types/types';
import { loadProviders, LoadProvidersOptions } from '../config/config';
import { extractJson as extractJsonUtil } from '../utils/json-extractor';
import { executeWithRetry } from '../utils/retry';
import Anthropic from '@anthropic-ai/sdk';

/**
 * AIClient 构造函数选项
 */
export interface AIClientOptions extends LoadProvidersOptions {
  // 可以扩展其他选项
}

/**
 * AI 客户端
 *
 * 提供统一的 AI 模型调用接口，支持多 Provider 配置
 */
export class AIClient {
  /** Provider 配置映射 */
  private providers: Record<string, ProviderConfig>;

  /** 用量统计 */
  private usageStats: UsageStats;

  /** Anthropic 客户端缓存 */
  private anthropicClients: Map<string, Anthropic> = new Map();

  /** 默认最大 Token 数 */
  private readonly DEFAULT_MAX_TOKENS = 4096;

  /**
   * 构造函数
   *
   * @param options - 客户端选项
   */
  constructor(options: AIClientOptions = {}) {
    // 加载配置
    this.providers = loadProviders(options);

    // 初始化用量统计
    this.usageStats = this.createEmptyUsageStats();
  }

  /**
   * 创建空的用量统计对象
   *
   * @returns 空的用量统计
   */
  private createEmptyUsageStats(): UsageStats {
    return {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      byModel: {},
    };
  }

  /**
   * 从文本中提取 JSON
   *
   * @param text - 包含 JSON 的文本
   * @returns 解析后的 JSON 对象，失败时返回空对象
   */
  extractJson(text: string): any {
    return extractJsonUtil(text);
  }

  /**
   * 获取用量统计
   *
   * @returns 用量统计的副本
   */
  getUsageStats(): UsageStats {
    // 返回深拷贝，防止外部修改
    return JSON.parse(JSON.stringify(this.usageStats));
  }

  /**
   * 重置用量统计
   */
  resetUsageStats(): void {
    this.usageStats = this.createEmptyUsageStats();
  }

  /**
   * 更新用量统计
   *
   * @param model - 模型名称
   * @param usage - Token 用量
   */
  private updateUsageStats(model: string, usage: Usage): void {
    // 更新总计
    this.usageStats.totalCalls++;
    this.usageStats.totalInputTokens += usage.inputTokens;
    this.usageStats.totalOutputTokens += usage.outputTokens;
    this.usageStats.totalTokens += usage.inputTokens + usage.outputTokens;

    // 更新按模型统计
    if (!this.usageStats.byModel[model]) {
      this.usageStats.byModel[model] = {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    this.usageStats.byModel[model].calls++;
    this.usageStats.byModel[model].inputTokens += usage.inputTokens;
    this.usageStats.byModel[model].outputTokens += usage.outputTokens;
  }

  /**
   * 更新成功调用统计
   */
  private incrementSuccessCalls(): void {
    this.usageStats.successCalls++;
  }

  /**
   * 更新失败调用统计
   */
  private incrementFailedCalls(): void {
    this.usageStats.failedCalls++;
  }

  /**
   * 解析模型引用
   *
   * @param modelRef - 模型引用，支持 "provider/model" 或仅模型名
   * @returns 解析后的 provider 和 model 名称
   * @throws 当 provider 或模型不存在时抛出错误
   */
  private resolveModel(modelRef?: string): { provider: string; model: string } {
    // 如果未指定模型，使用第一个 provider 的第一个模型
    if (!modelRef) {
      const providerNames = Object.keys(this.providers);
      if (providerNames.length === 0) {
        throw new Error('No providers configured');
      }

      const provider = providerNames[0];
      const providerConfig = this.providers[provider];
      const models = Array.isArray(providerConfig.models)
        ? providerConfig.models
        : Object.keys(providerConfig.models);

      if (models.length === 0) {
        throw new Error(`No models configured for provider ${provider}`);
      }

      return { provider, model: models[0] };
    }

    // 解析 "provider/model" 格式
    if (modelRef.includes('/')) {
      const [provider, model] = modelRef.split('/');

      if (!this.providers[provider]) {
        throw new Error(`Provider not found: ${provider}`);
      }

      const providerConfig = this.providers[provider];
      const models = Array.isArray(providerConfig.models)
        ? providerConfig.models
        : Object.keys(providerConfig.models);

      if (!models.includes(model)) {
        throw new Error(`Model ${model} not found in provider ${provider}`);
      }

      return { provider, model };
    }

    // 仅模型名：在所有 provider 中查找
    for (const [provider, config] of Object.entries(this.providers)) {
      const models = Array.isArray(config.models)
        ? config.models
        : Object.keys(config.models);

      if (models.includes(modelRef)) {
        return { provider, model: modelRef };
      }
    }

    throw new Error(`Model ${modelRef} not found in any provider`);
  }

  /**
   * 创建 Anthropic SDK 客户端
   *
   * @param config - Provider 配置
   * @returns Anthropic 客户端实例
   */
  private createAnthropicClient(config: ProviderConfig): Anthropic {
    return new Anthropic({
      baseURL: config.baseURL,
      apiKey: config.authToken,
    });
  }

  /**
   * 获取或创建 Anthropic 客户端
   *
   * @param provider - Provider 名称
   * @returns Anthropic 客户端实例
   */
  private getOrCreateClient(provider: string): Anthropic {
    // 检查缓存
    if (this.anthropicClients.has(provider)) {
      return this.anthropicClients.get(provider)!;
    }

    // 创建新客户端
    const config = this.providers[provider];
    const client = this.createAnthropicClient(config);

    // 缓存客户端
    this.anthropicClients.set(provider, client);

    return client;
  }

  /**
   * 单轮查询
   *
   * @param prompt - 用户提示
   * @param options - 查询选项
   * @param logger - 可选的日志记录器
   * @returns AI 回复文本
   */
  async query(prompt: string, options?: ChatOptions, logger?: Logger): Promise<string> {
    logger?.debug('Starting query', { prompt, options });

    const response = await this.chat([{ role: 'user', content: prompt }], options, logger);

    logger?.debug('Query completed', { response });

    return response.text;
  }

  /**
   * 多轮对话
   *
   * @param messages - 对话消息列表
   * @param options - 对话选项
   * @param logger - 可选的日志记录器
   * @returns 完整的对话响应
   */
  async chat(messages: ChatMessage[], options?: ChatOptions, logger?: Logger): Promise<ChatResponse> {
    logger?.debug('Starting chat', { messages, options });

    // 解析模型
    const { provider, model } = this.resolveModel(options?.model);
    logger?.debug('Resolved model', { provider, model });

    // 获取客户端
    const client = this.getOrCreateClient(provider);

    // 构建请求参数
    const requestParams: Anthropic.Messages.MessageCreateParams = {
      model,
      max_tokens: options?.maxTokens ?? this.DEFAULT_MAX_TOKENS,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    };

    // 添加系统提示词
    if (options?.systemPrompt) {
      requestParams.system = options.systemPrompt;
    }

    logger?.debug('Calling Anthropic API', { requestParams });

    try {
      // 使用重试机制调用 API
      const response = await executeWithRetry(async () => {
        return await client.messages.create(requestParams);
      });

      logger?.debug('API call successful', { response });

      // 提取文本内容
      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as Anthropic.Messages.TextBlock).text)
        .join('');

      // 转换用量统计
      const usage: Usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };

      // 更新统计
      this.updateUsageStats(model, usage);
      this.incrementSuccessCalls();

      // 构建响应
      const chatResponse: ChatResponse = {
        text: textContent,
        stopReason: response.stop_reason,
        model: response.model,
        usage,
      };

      logger?.info('Chat completed', {
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });

      return chatResponse;
    } catch (error) {
      logger?.error('Chat failed', { error });

      // 更新失败统计
      this.incrementFailedCalls();

      throw error;
    }
  }
}
