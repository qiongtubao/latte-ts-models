import { UsageStats, Usage, ProviderConfig, ChatMessage, ChatResponse, ChatOptions, Logger, ChatResponseWithTools, ToolDefinition, ToolUseBlock, ContentBlock, StreamInterruptedError, ToolResultBlock, FormatOptions, StreamEventCallback, ToolExecutor, ToolExecutionResult, RetryEvent, NonRetryableError, ParallelExecutionOptions, ToolUseLoopOptions, ToolUseLoopResult, ToolUseLoopState, ToolUseLoopError, ToolUseLoopResultStatus } from '../types/types';
import { loadProviders, LoadProvidersOptions } from '../config/config';
import { extractJson as extractJsonUtil } from '../utils/json-extractor';
import Anthropic from '@anthropic-ai/sdk';
import { IChatAdapter, IToolUseAdapter, isToolUseAdapter } from '../adapters/IChatAdapter';
import { AnthropicAdapter } from '../adapters/AnthropicAdapter';
import { OpenAIAdapter } from '../adapters/OpenAIAdapter';

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

  /** 适配器缓存 */
  private adapters: Map<string, IChatAdapter> = new Map();

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
    return AnthropicAdapter.buildToolResultMessage(toolUseId, result, isError, formatOptions);
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
   * 获取或创建适配器
   */
  private getOrCreateAdapter(provider: string): IChatAdapter {
    if (this.adapters.has(provider)) {
      return this.adapters.get(provider)!;
    }

    const config = this.providers[provider];
    const protocol = config.protocol || 'anthropic'; // 默认向后兼容

    const adapter: IChatAdapter = protocol === 'openai'
      ? new OpenAIAdapter(config)
      : new AnthropicAdapter(config);

    this.adapters.set(provider, adapter);
    return adapter;
  }

  /**
   * 获取支持 Tool Use 的适配器
   */
  private getToolUseAdapter(provider: string): IChatAdapter & IToolUseAdapter {
    const adapter = this.getOrCreateAdapter(provider);
    if (!isToolUseAdapter(adapter)) {
      throw new Error(`Provider '${provider}' does not support tool use via the current protocol.`);
    }
    return adapter;
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

    const { provider, model } = this.resolveModel(options?.model);
    logger?.debug('Resolved model', { provider, model });

    const adapter = this.getOrCreateAdapter(provider);

    try {
      const response = await adapter.chat(messages, { ...options, model });

      if (response.usage) {
        this.updateUsageStats(model, response.usage);
      }
      this.incrementSuccessCalls();

      logger?.info('Chat completed', {
        model,
        inputTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
      });

      return response;
    } catch (error) {
      logger?.error('Chat failed', { error });
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

    const { provider, model } = this.resolveModel(options?.model);
    logger?.debug('Resolved model', { provider, model });

    const adapter = this.getToolUseAdapter(provider);

    try {
      const response = await adapter.chatWithTools(messages, { ...options, model });

      if (response.usage) {
        this.updateUsageStats(model, response.usage);
      }
      this.incrementSuccessCalls();

      logger?.info('ChatWithTools completed', {
        model,
        toolCallsCount: response.toolCalls?.length || 0,
      });

      return response;
    } catch (error) {
      logger?.error('ChatWithTools failed', { error });
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

    const { provider, model } = this.resolveModel(options?.model);
    logger?.debug('Resolved model', { provider, model });

    const adapter = this.getOrCreateAdapter(provider);

    try {
      // 包装 onEvent 以提取 usage 到统计
      let streamUsage: Usage | undefined;
      const wrappedOnEvent: StreamEventCallback = (event) => {
        if (event.type === 'stream_end' && event.usage) {
          streamUsage = event.usage;
        }
        onEvent?.(event);
      };

      const response = await adapter.chatStream(messages, { ...options, model }, wrappedOnEvent);

      if (streamUsage) {
        this.updateUsageStats(model, streamUsage);
      } else if (response.usage) {
        this.updateUsageStats(model, response.usage);
      }
      this.incrementSuccessCalls();

      logger?.info('ChatStream completed', {
        model,
        toolCallsCount: response.toolCalls?.length || 0,
      });

      return response;
    } catch (error) {
      logger?.error('ChatStream failed', { error });
      this.incrementFailedCalls();
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
    // 使用第一个可用的 provider 的适配器来执行工具
    const providerNames = Object.keys(this.providers);
    if (providerNames.length === 0) {
      throw new Error('No providers configured for tool execution');
    }
    // executeToolsParallel 默认使用 AnthropicAdapter
    const adapter = this.getToolUseAdapter(providerNames[0]);
    const result = await adapter.executeToolsParallel(toolCalls, executor, options);
    return result;
  }

  /**
   * 自动执行 Tool Use 循环
   *
   * @param messages - 初始对话消息
   * @param options - 对话选项
   * @param executor - 工具执行函数
   * @param loopOptions - 循环控制选项
   * @param logger - 可选的日志记录器
   * @returns 循环结果
   */
  async executeToolUseLoop(
    messages: ChatMessage[],
    options: ChatOptions,
    executor: ToolExecutor,
    loopOptions?: ToolUseLoopOptions,
    logger?: Logger
  ): Promise<ToolUseLoopResult> {
    const maxIterations = loopOptions?.maxIterations ?? 10;
    const forceFinalize = loopOptions?.forceFinalize ?? true;
    const timeout = loopOptions?.timeout ?? 120000;
    const onStateChange = loopOptions?.onStateChange;
    const onToolCall = loopOptions?.onToolCall;
    const onToolResult = loopOptions?.onToolResult;
    const shouldContinue = loopOptions?.shouldContinue;

    const startTime = Date.now();
    let currentMessages = [...messages];
    let iterations = 0;
    let toolCallsExecuted = 0;
    let currentState: ToolUseLoopState = 'idle';

    const setState = (state: ToolUseLoopState) => {
      currentState = state;
      onStateChange?.(state);
    };

    const buildResult = (
      status: ToolUseLoopResultStatus,
      response: ChatResponse,
      error?: ToolUseLoopError
    ): ToolUseLoopResult => ({
      status,
      response,
      messages: currentMessages,
      iterations,
      toolCallsExecuted,
      state: currentState,
      error
    });

    try {
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        iterations = iteration + 1;

        // Check timeout
        if (Date.now() - startTime > timeout) {
          logger?.warn('Loop timeout exceeded');
          const cleanedMessages = this.cleanupHangingToolCalls(currentMessages);
          currentMessages = cleanedMessages;
          setState('failed');
          return buildResult('error', { text: '', stopReason: 'error', model: '', usage: undefined }, {
            code: 'TIMEOUT',
            message: `Loop exceeded timeout of ${timeout}ms`
          });
        }

        // Check if last iteration
        const isLastIteration = iteration === maxIterations - 1;

        // Set state
        setState('thinking');

        // Prepare options (remove tools on last iteration if forceFinalize)
        const currentOptions = isLastIteration && forceFinalize
          ? { ...options, tools: undefined }
          : options;

        logger?.debug(`Loop iteration ${iteration + 1}/${maxIterations}`, {
          isLastIteration,
          forceFinalize: isLastIteration && forceFinalize
        });

        // Call AI
        const response = await this.chatWithTools(currentMessages, currentOptions, logger);

        // Check if no tool calls
        if (!response.toolCalls || response.toolCalls.length === 0) {
          logger?.debug('No tool calls, returning final response');
          setState('completed');
          return buildResult('completed', response);
        }

        // Check shouldContinue
        if (shouldContinue && !shouldContinue(iteration, response)) {
          logger?.debug('shouldContinue returned false, stopping loop');
          const cleanedMessages = this.cleanupHangingToolCalls(currentMessages);
          currentMessages = cleanedMessages;
          setState('completed');
          return buildResult('completed', response);
        }

        // Handle last iteration with tool calls
        if (isLastIteration) {
          if (forceFinalize) {
            // Already removed tools, model still tried to call them
            // This means model couldn't finalize, return as-is
            logger?.warn('Model attempted tool call on final iteration');
            setState('failed');
            return buildResult('max_iterations', response, {
              code: 'MAX_ITERATIONS',
              message: 'Model attempted tool call on final iteration'
            });
          } else {
            // Not forcing finalize, cleanup and return
            logger?.warn('Max iterations reached with pending tool calls');
            const cleanedMessages = this.cleanupHangingToolCalls(currentMessages);
            currentMessages = cleanedMessages;
            setState('failed');
            return buildResult('max_iterations', response, {
              code: 'MAX_ITERATIONS',
              message: `Reached max iterations of ${maxIterations}`
            });
          }
        }

        // Add assistant message with tool calls
        currentMessages.push({
          role: 'assistant',
          content: response.contentBlocks || [{ type: 'text', text: response.text }]
        });

        // Execute tools
        setState('executing_tools');

        for (const toolCall of response.toolCalls) {
          onToolCall?.(toolCall);

          logger?.debug(`Executing tool: ${toolCall.name}`, {
            toolId: toolCall.id,
            input: toolCall.input
          });

          const result = await this.executeToolWithRetry(
            toolCall,
            executor,
            3,
            { logger }
          );

          onToolResult?.(result);
          toolCallsExecuted++;

          // Build tool result message (inject error context on failure)
          const errorMessage = result.success
            ? result.result
            : `工具执行失败，错误原因：${result.error}，请尝试其他方法或告知用户`;

          const toolResultMessage = AIClient.buildToolResultMessage(
            toolCall.id,
            errorMessage,
            !result.success
          );

          currentMessages.push(toolResultMessage);

          logger?.debug(`Tool result added`, {
            toolName: toolCall.name,
            success: result.success
          });
        }

        // Processing results
        setState('processing_results');

        logger?.debug(`Iteration ${iteration + 1} complete`, {
          toolCallsExecuted,
          totalMessages: currentMessages.length
        });
      }

      // Should not reach here, but just in case
      setState('completed');
      return buildResult('completed', { text: '', stopReason: 'end_turn', model: '', usage: undefined });

    } catch (error) {
      logger?.error('Loop failed with error', { error });
      const cleanedMessages = this.cleanupHangingToolCalls(currentMessages);
      currentMessages = cleanedMessages;
      setState('failed');
      return buildResult('error', { text: '', stopReason: 'error', model: '', usage: undefined }, {
        code: 'UNKNOWN',
        message: error instanceof Error ? error.message : String(error),
        originalError: error instanceof Error ? error : new Error(String(error))
      });
    }
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
