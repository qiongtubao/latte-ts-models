import { UsageStats, Usage, ProviderConfig, ChatMessage, ChatResponse, ChatOptions, Logger, ChatResponseWithTools, ToolDefinition, ToolUseBlock, ContentBlock, StreamInterruptedError, ToolResultBlock, FormatOptions, StreamEventCallback, ToolExecutor, ToolExecutionResult, RetryEvent, NonRetryableError, ParallelExecutionOptions } from '../types/types';
import { loadProviders, LoadProvidersOptions } from '../config/config';
import { extractJson as extractJsonUtil } from '../utils/json-extractor';
import { executeWithRetry } from '../utils/retry';
import { formatToolResult } from '../utils/tool-result-formatter';
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
   * 构建工具结果消息（增强版）
   *
   * @param toolUseId - 对应的 tool_use ID
   * @param result - 工具执行结果
   * @param isError - 是否是错误结果
   * @param formatOptions - 格式化选项
   * @returns 工具结果消息
   */
  static buildToolResultMessage(
    toolUseId: string,
    result: any,
    isError: boolean = false,
    formatOptions?: FormatOptions
  ): ChatMessage {
    // Format the result
    const formattedContent = formatToolResult(result, isError, formatOptions);

    const toolResultBlock: ToolResultBlock = {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: formattedContent,
      is_error: isError
    };

    return {
      role: 'user',
      content: [toolResultBlock]
    };
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
   * 转换消息内容为 Anthropic SDK 格式
   *
   * @param content - 消息内容
   * @returns SDK 格式的消息内容
   */
  private convertContentToAnthropic(
    content: string | ContentBlock[]
  ): string | Anthropic.Messages.ContentBlockParam[] {
    if (typeof content === 'string') {
      return content;
    }

    return content.map(block => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: block.text };
      } else if (block.type === 'tool_use') {
        return {
          type: 'tool_use' as const,
          id: block.id,
          name: block.name,
          input: block.input,
        };
      } else if (block.type === 'tool_result') {
        // Convert tool_result content - SDK only allows text/image in tool_result
        const resultContent = typeof block.content === 'string'
          ? block.content
          : block.content.map(c => {
              if (typeof c === 'string') {
                return { type: 'text' as const, text: c };
              } else if (c.type === 'text') {
                return { type: 'text' as const, text: c.text };
              }
              // Note: SDK doesn't support tool_use blocks in tool_result
              // Convert to text representation
              return { type: 'text' as const, text: JSON.stringify(c) };
            });

        return {
          type: 'tool_result' as const,
          tool_use_id: block.tool_use_id,
          content: resultContent,
          is_error: block.is_error,
        };
      }

      throw new Error(`Unsupported content block type`);
    });
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
        content: this.convertContentToAnthropic(msg.content),
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
      }) as Anthropic.Messages.Message;

      logger?.debug('API call successful', { response });

      // 提取文本内容
      const textContent = response.content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
        .map(block => block.text)
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

  /**
   * 带 Tool Use 的多轮对话
   *
   * @param messages - 对话消息列表
   * @param options - 对话选项（包含工具定义）
   * @param logger - 可选的日志记录器
   * @returns 包含工具调用的对话响应
   */
  async chatWithTools(
    messages: ChatMessage[],
    options?: ChatOptions,
    logger?: Logger
  ): Promise<ChatResponseWithTools> {
    logger?.debug('Starting chatWithTools', { messages, options });

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
        content: this.convertContentToAnthropic(msg.content),
      })),
    };

    // 添加系统提示词
    if (options?.systemPrompt) {
      requestParams.system = options.systemPrompt;
    }

    // 添加工具定义
    if (options?.tools && options.tools.length > 0) {
      requestParams.tools = options.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema,
      }));
    }

    // 添加工具选择策略
    if (options?.toolChoice) {
      if (typeof options.toolChoice === 'string') {
        requestParams.tool_choice = { type: options.toolChoice };
      } else {
        requestParams.tool_choice = options.toolChoice;
      }
    }

    logger?.debug('Calling Anthropic API with tools', { requestParams });

    try {
      // 使用重试机制调用 API
      const response = await executeWithRetry(async () => {
        return await client.messages.create(requestParams);
      }) as Anthropic.Messages.Message;

      logger?.debug('API call successful', { response });

      // 提取所有内容块
      const contentBlocks: ContentBlock[] = response.content.map(block => {
        if (block.type === 'text') {
          const textBlock = block as Anthropic.Messages.TextBlock;
          return {
            type: 'text' as const,
            text: textBlock.text,
          };
        } else if (block.type === 'tool_use') {
          const toolBlock = block as Anthropic.Messages.ToolUseBlock;
          return {
            type: 'tool_use' as const,
            id: toolBlock.id,
            name: toolBlock.name,
            input: toolBlock.input as Record<string, any>,
          };
        }
        // 其他类型（如 tool_result）暂时不处理
        throw new Error(`Unsupported content block type: ${block.type}`);
      });

      // 提取文本内容
      const textContent = contentBlocks
        .filter(block => block.type === 'text')
        .map(block => (block as { type: 'text'; text: string }).text)
        .join('');

      // 提取工具调用
      const toolCalls: ToolUseBlock[] = contentBlocks.filter(
        block => block.type === 'tool_use'
      ) as ToolUseBlock[];

      // 转换用量统计
      const usage: Usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };

      // 更新统计
      this.updateUsageStats(model, usage);
      this.incrementSuccessCalls();

      // 构建响应
      const chatResponse: ChatResponseWithTools = {
        text: textContent,
        stopReason: response.stop_reason,
        model: response.model,
        usage,
        contentBlocks,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };

      logger?.info('ChatWithTools completed', {
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        toolCallsCount: toolCalls.length,
      });

      return chatResponse;
    } catch (error) {
      logger?.error('ChatWithTools failed', { error });

      // 更新失败统计
      this.incrementFailedCalls();

      throw error;
    }
  }

  /**
   * 流式对话（支持 Tool Use）
   *
   * @param messages - 对话消息列表
   * @param options - 对话选项（包含工具定义）
   * @param onEvent - 可选的流事件回调函数
   * @param logger - 可选的日志记录器
   * @returns 包含工具调用的对话响应
   */
  async chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
    onEvent?: StreamEventCallback,
    logger?: Logger
  ): Promise<ChatResponseWithTools> {
    logger?.debug('Starting chatStream', { messages, options });

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
        content: this.convertContentToAnthropic(msg.content),
      })),
    };

    // 添加系统提示词
    if (options?.systemPrompt) {
      requestParams.system = options.systemPrompt;
    }

    // 添加工具定义
    if (options?.tools && options.tools.length > 0) {
      requestParams.tools = options.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema,
      }));
    }

    // 添加工具选择策略
    if (options?.toolChoice) {
      if (typeof options.toolChoice === 'string') {
        requestParams.tool_choice = { type: options.toolChoice };
      } else {
        requestParams.tool_choice = options.toolChoice;
      }
    }

    logger?.debug('Starting streaming API call', { requestParams });

    // 用于累积数据
    const contentBlocks: ContentBlock[] = [];
    const partialResponse: Partial<ChatResponseWithTools> = {};

    // Safe event trigger with exception isolation
    let hasEmittedError = false;

    const safeTriggerEvent = (event: any) => {
      if (hasEmittedError && event.type === 'stream_error') return;
      if (event.type === 'stream_error') hasEmittedError = true;

      try {
        onEvent?.(event);
      } catch (error) {
        logger?.error('Stream event callback error', { error, event });
      }
    };

    try {
      // 创建流式请求
      const stream = await client.messages.stream(requestParams);

      // Track if stream_start has been emitted
      let hasEmittedStart = false;

      // 处理流事件
      for await (const event of stream) {
        logger?.debug('Stream event', { event });

        // Trigger stream_start on first event
        if (!hasEmittedStart) {
          safeTriggerEvent({
            type: 'stream_start',
            model: model  // Use the resolved model
          });
          hasEmittedStart = true;
        }

        if (event.type === 'content_block_start') {
          const block = event.content_block;
          if (block.type === 'text') {
            contentBlocks.push({
              type: 'text',
              text: '',
            });
            safeTriggerEvent({ type: 'text', delta: '' });
          } else if (block.type === 'tool_use') {
            contentBlocks.push({
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: {},
            });
            safeTriggerEvent({
              type: 'tool_use_start',
              toolName: block.name,
              toolId: block.id
            });
          }
        } else if (event.type === 'content_block_delta') {
          const index = event.index;
          const delta = event.delta;

          if (delta.type === 'text_delta' && contentBlocks[index]) {
            const textBlock = contentBlocks[index] as { type: 'text'; text: string };
            textBlock.text += delta.text;
            safeTriggerEvent({ type: 'text', delta: delta.text });
          } else if (delta.type === 'input_json_delta' && contentBlocks[index]) {
            const toolBlock = contentBlocks[index] as ToolUseBlock;
            // 累积 JSON 输入（partial_json 字段包含部分 JSON）
            try {
              // Note: SDK provides partial JSON string that needs to be accumulated
              // For now, we'll parse the final input from finalMessage
              logger?.debug('Partial JSON received', { partialJson: delta.partial_json });
              safeTriggerEvent({
                type: 'tool_use_input',
                toolId: toolBlock.id,
                partialInput: delta.partial_json
              });
            } catch (e) {
              logger?.warn('Failed to process partial JSON', { e });
            }
          }
        } else if (event.type === 'content_block_stop') {
          logger?.debug('Content block stopped', { index: event.index });
          const block = contentBlocks[event.index];
          if (block && block.type === 'tool_use') {
            safeTriggerEvent({
              type: 'tool_use_end',
              toolId: (block as ToolUseBlock).id,
              partialInput: (block as ToolUseBlock).input
            });
          }
        }
      }

      // 获取最终消息
      const finalMessage = await stream.finalMessage();

      logger?.debug('Stream completed', { finalMessage });

      // Trigger stream_end
      safeTriggerEvent({
        type: 'stream_end',
        model: finalMessage.model,
        usage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens
        }
      });

      // 从 finalMessage 中提取完整的内容块（替换部分累积的数据）
      const finalContentBlocks: ContentBlock[] = finalMessage.content.map(block => {
        if (block.type === 'text') {
          const textBlock = block as Anthropic.Messages.TextBlock;
          return {
            type: 'text' as const,
            text: textBlock.text,
          };
        } else if (block.type === 'tool_use') {
          const toolBlock = block as Anthropic.Messages.ToolUseBlock;
          return {
            type: 'tool_use' as const,
            id: toolBlock.id,
            name: toolBlock.name,
            input: toolBlock.input as Record<string, any>,
          };
        }
        throw new Error(`Unsupported content block type: ${block.type}`);
      });

      // 提取文本内容
      const textContent = finalContentBlocks
        .filter(block => block.type === 'text')
        .map(block => (block as { type: 'text'; text: string }).text)
        .join('');

      // 提取工具调用
      const toolCalls: ToolUseBlock[] = finalContentBlocks.filter(
        block => block.type === 'tool_use'
      ) as ToolUseBlock[];

      // 转换用量统计
      const usage: Usage = {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
      };

      // 更新统计
      this.updateUsageStats(model, usage);
      this.incrementSuccessCalls();

      // 构建响应
      const chatResponse: ChatResponseWithTools = {
        text: textContent,
        stopReason: finalMessage.stop_reason,
        model: finalMessage.model,
        usage,
        contentBlocks: finalContentBlocks,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };

      logger?.info('ChatStream completed', {
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        toolCallsCount: toolCalls.length,
      });

      return chatResponse;
    } catch (error) {
      logger?.error('ChatStream failed', { error });

      // Trigger stream_error
      safeTriggerEvent({
        type: 'stream_error',
        error: error instanceof Error ? error : new Error(String(error))
      });

      // 更新失败统计
      this.incrementFailedCalls();

      // 如果有部分数据，创建中断错误
      if (contentBlocks.length > 0) {
        const partialText = contentBlocks
          .filter(block => block.type === 'text')
          .map(block => (block as { type: 'text'; text: string }).text)
          .join('');

        partialResponse.text = partialText;
        partialResponse.contentBlocks = contentBlocks;
        partialResponse.toolCalls = contentBlocks.filter(
          block => block.type === 'tool_use'
        ) as ToolUseBlock[];

        throw new StreamInterruptedError(
          'Stream interrupted',
          partialResponse
        );
      }

      throw error;
    }
  }

  /**
   * 执行工具调用并自动重试
   *
   * @param toolCall - 工具调用信息
   * @param executor - 工具执行函数
   * @param maxRetries - 最大重试次数（默认 3）
   * @param options - 可选配置
   * @returns 工具执行结果
   */
  async executeToolWithRetry(
    toolCall: ToolUseBlock,
    executor: ToolExecutor,
    maxRetries: number = 3,
    options?: {
      logger?: Logger;
      onRetry?: (event: RetryEvent) => void;
    }
  ): Promise<ToolExecutionResult> {
    const logger = options?.logger;
    const onRetry = options?.onRetry;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger?.debug(`Executing tool (attempt ${attempt}/${maxRetries})`, {
          toolName: toolCall.name,
          toolId: toolCall.id,
          input: toolCall.input,
        });

        const result = await executor(toolCall.name, toolCall.input, {
          attempt,
          maxRetries,
          toolId: toolCall.id
        });

        logger?.debug('Tool execution successful', {
          toolName: toolCall.name,
          attempt,
        });

        return { success: true, result };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger?.warn(`Tool execution failed (attempt ${attempt}/${maxRetries})`, {
          toolName: toolCall.name,
          error: lastError.message,
        });

        // If non-retryable error, break immediately
        if (error instanceof NonRetryableError) {
          logger?.error('Tool execution failed with non-retryable error', {
            toolName: toolCall.name,
            error: lastError.message,
          });
          break;
        }

        // Wait with exponential backoff before retry
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);

          // Trigger retry callback
          onRetry?.({
            toolName: toolCall.name,
            toolId: toolCall.id,
            attempt,
            maxRetries,
            delay,
            error: lastError
          });

          logger?.debug(`Waiting ${delay}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      isSystemError: true
    };
  }

  /**
   * 并行执行多个工具调用
   *
   * @param toolCalls - 工具调用列表
   * @param executor - 工具执行函数
   * @param options - 并发执行选项
   * @returns 工具执行结果 Map（按 toolCall.id 索引）
   */
  async executeToolsParallel(
    toolCalls: ToolUseBlock[],
    executor: ToolExecutor,
    options?: ParallelExecutionOptions,
    logger?: Logger
  ): Promise<Map<string, ToolExecutionResult>> {
    const maxConcurrency = options?.maxConcurrency ?? 5;
    const getResourceKey = options?.getResourceKey;
    const isConcurrencySafe = options?.isConcurrencySafe;
    const results = new Map<string, ToolExecutionResult>();

    if (toolCalls.length === 0) {
      return results;
    }

    // Step 1: Separate concurrency-safe tools and group by resource
    const safeTools: ToolUseBlock[] = [];
    const resourceQueues = new Map<string | null, ToolUseBlock[]>();

    for (const toolCall of toolCalls) {
      // Check if tool is concurrency-safe
      if (isConcurrencySafe?.(toolCall)) {
        safeTools.push(toolCall);
        continue;
      }

      // Extract resource key
      const key = getResourceKey?.(toolCall) ?? null;
      if (!resourceQueues.has(key)) {
        resourceQueues.set(key, []);
      }
      resourceQueues.get(key)!.push(toolCall);
    }

    // Step 2: Build execution batches
    const batches: ToolUseBlock[][] = [];

    // Safe tools can all run in parallel (up to maxConcurrency)
    if (safeTools.length > 0) {
      for (let i = 0; i < safeTools.length; i += maxConcurrency) {
        batches.push(safeTools.slice(i, i + maxConcurrency));
      }
    }

    // Resource queues: same resource = sequential, different resources = parallel
    const queueArrays = Array.from(resourceQueues.values());
    if (queueArrays.length > 0) {
      // Interleave: take one from each queue per parallel slot
      const maxLen = Math.max(...queueArrays.map(q => q.length));
      for (let j = 0; j < maxLen; j++) {
        const parallelGroup: ToolUseBlock[] = [];
        for (const queue of queueArrays) {
          if (queue[j]) {
            parallelGroup.push(queue[j]);
          }
        }
        if (parallelGroup.length > 0) {
          // Further split by maxConcurrency
          for (let i = 0; i < parallelGroup.length; i += maxConcurrency) {
            batches.push(parallelGroup.slice(i, i + maxConcurrency));
          }
        }
      }
    }

    // Step 3: Execute batches
    for (const batch of batches) {
      options?.onBatchStart?.(batch);

      const batchPromises = batch.map(async (toolCall) => {
        try {
          const result = await this.executeToolWithRetry(
            toolCall,
            executor,
            3,
            {
              logger,
              onRetry: options?.onRetry
            }
          );
          results.set(toolCall.id, result);
          return { toolCall, result };
        } catch (error) {
          // Exception isolation: single failure doesn't break batch
          const failedResult: ToolExecutionResult = {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            isSystemError: true
          };
          results.set(toolCall.id, failedResult);
          return { toolCall, result: failedResult };
        }
      });

      await Promise.all(batchPromises);

      options?.onBatchEnd?.(results);
      logger?.debug('Batch completed', {
        batchSize: batch.length,
        successCount: batch.filter(tc => results.get(tc.id)?.success).length
      });
    }

    return results;
  }

  /**
   * 清理悬空的 tool_use 和孤立的 tool_result 消息块
   */
  private cleanupHangingToolCalls(messages: ChatMessage[]): ChatMessage[] {
    const cleaned = [...messages];

    // Step 1: Find all tool_use IDs
    const toolUseIds = new Set<string>();
    for (const msg of cleaned) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            toolUseIds.add((block as ToolUseBlock).id);
          }
        }
      }
    }

    // Step 2: Find all tool_result tool_use_ids
    const toolResultIds = new Set<string>();
    for (const msg of cleaned) {
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_result') {
            toolResultIds.add((block as ToolResultBlock).tool_use_id);
          }
        }
      }
    }

    // Step 3: Remove dangling tool_use blocks (no corresponding tool_result)
    for (let i = 0; i < cleaned.length; i++) {
      const msg = cleaned[i];
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const blocks = msg.content as ContentBlock[];
        const cleanedBlocks = blocks.filter(block => {
          if (block.type === 'tool_use') {
            return toolResultIds.has((block as ToolUseBlock).id);
          }
          return true;
        });
        if (cleanedBlocks.length !== blocks.length) {
          cleaned[i] = { ...msg, content: cleanedBlocks };
        }
      }
    }

    // Step 4: Remove orphaned tool_result blocks (no corresponding tool_use)
    for (let i = 0; i < cleaned.length; i++) {
      const msg = cleaned[i];
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        const blocks = msg.content as ContentBlock[];
        const cleanedBlocks = blocks.filter(block => {
          if (block.type === 'tool_result') {
            return toolUseIds.has((block as ToolResultBlock).tool_use_id);
          }
          return true;
        });
        if (cleanedBlocks.length !== blocks.length) {
          cleaned[i] = { ...msg, content: cleanedBlocks };
        }
      }
    }

    return cleaned;
  }
}
