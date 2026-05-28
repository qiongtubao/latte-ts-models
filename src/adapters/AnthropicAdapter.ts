import Anthropic from '@anthropic-ai/sdk';
import {
  ProviderConfig,
  ChatMessage,
  ChatResponse,
  ChatOptions,
  Logger,
  ChatResponseWithTools,
  ToolUseBlock,
  ContentBlock,
  StreamInterruptedError,
  ToolResultBlock,
  FormatOptions,
  StreamEventCallback,
  ToolExecutor,
  ToolExecutionResult,
  RetryEvent,
  NonRetryableError,
  ParallelExecutionOptions,
  ToolUseLoopOptions,
  ToolUseLoopResult,
  ToolUseLoopState,
  ToolUseLoopResultStatus,
  ToolUseLoopError,
} from '../types/types';
import { IChatAdapter, IToolUseAdapter } from './IChatAdapter';
import { executeWithRetry } from '../utils/retry';
import { formatToolResult } from '../utils/tool-result-formatter';

/**
 * Anthropic protocol adapter — wraps the Anthropic SDK in the adapter interfaces.
 *
 * Implements IChatAdapter (explicitly) and IToolUseAdapter (structurally).
 * This adapter handles Anthropic-specific message formatting, streaming,
 * tool use, and retry logic.
 */
export class AnthropicAdapter implements IChatAdapter, IToolUseAdapter {
  private client: Anthropic;
  private readonly DEFAULT_MAX_TOKENS = 4096;

  /**
   * @param config - Provider configuration containing baseURL and authToken
   */
  constructor(config: ProviderConfig) {
    this.client = new Anthropic({
      baseURL: config.baseURL,
      apiKey: config.authToken,
    });
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

    const model = options?.model ?? 'claude-sonnet-4-20250514';

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
        return await this.client.messages.create(requestParams);
      }) as Anthropic.Messages.Message;

      logger?.debug('API call successful', { response });

      // 提取文本内容
      const textContent = response.content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');

      // 转换用量统计
      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };

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

    const model = options?.model ?? 'claude-sonnet-4-20250514';

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
        return await this.client.messages.create(requestParams);
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
      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };

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

    const model = options?.model ?? 'claude-sonnet-4-20250514';

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
      const stream = await this.client.messages.stream(requestParams);

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
      const usage = {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
      };

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
   * @param logger - 可选的日志记录器
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

          const toolResultMessage = AnthropicAdapter.buildToolResultMessage(
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
