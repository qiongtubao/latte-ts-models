# Tool Use and Streaming Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive Tool Use and Streaming Response support to latte-ts-models library for AI Agent systems.

**Architecture:** Extend existing type system with content blocks (TextBlock, ToolUseBlock, ToolResultBlock), add two new methods (chatWithTools, chatStream) to AIClient, implement message conversion and content extraction helpers, maintain backward compatibility.

**Tech Stack:** TypeScript, Anthropic SDK, Jest for testing

---

## File Structure

**Modified files:**
- `src/types/types.ts` - Add all new types and error classes
- `src/core/ai-client.ts` - Add new methods and helpers
- `src/index.ts` - Export new types and errors
- `README.md` - Update documentation

**New test files:**
- `src/types/types.test.ts` - Type tests (extend existing)
- `src/core/ai-client.test.ts` - Method tests (extend existing)

---

## Task 1: Add Type Definitions

**Files:**
- Modify: `src/types/types.ts` (lines 1-127)

- [ ] **Step 1: Add SchemaProperty interface**

Add after line 9 (after `ModelConfig` interface):

```typescript
/**
 * JSON Schema property definition
 */
export interface SchemaProperty {
  /** JSON Schema type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null' */
  type: string;
  description?: string;
  enum?: any[];
  items?: SchemaProperty;  // For array type
  properties?: Record<string, SchemaProperty>;  // For object type
  required?: string[];
}
```

- [ ] **Step 2: Add ContentBlock types**

Add after `ChatMessage` interface (after line 29):

```typescript
/**
 * Text content block
 */
export interface TextBlock {
  type: 'text';
  text: string;
}

/**
 * Tool use content block
 */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;  // Tool call ID for linking to tool_result
  name: string;  // Tool name
  input: Record<string, any>;  // Tool input parameters
}

/**
 * Tool result content (avoiding circular reference)
 */
export type ToolResultContent = TextBlock | ToolUseBlock | string;

/**
 * Tool result content block
 */
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;  // Corresponding tool_use ID
  content: ToolResultContent[] | string;  // Multimodal support
  is_error?: boolean;  // Whether this is an error result
}

/**
 * Content block union type
 */
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;
```

- [ ] **Step 3: Add ToolDefinition interface**

Add after `ChatResponse` interface (after line 47):

```typescript
/**
 * Tool definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, SchemaProperty>;
    required?: string[];
  };
}
```

- [ ] **Step 4: Update ChatMessage interface**

Replace lines 26-29 with:

```typescript
/**
 * 聊天消息（扩展支持 Tool Use）
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];  // 支持字符串或内容块数组
}
```

- [ ] **Step 5: Update ChatOptions interface**

Replace lines 52-56 with:

```typescript
/**
 * 聊天选项（扩展支持工具）
 */
export interface ChatOptions {
  model?: string;            // 模型标识，支持 "provider/model" 格式
  maxTokens?: number;        // 最大生成 Token 数
  systemPrompt?: string;     // 系统提示词
  tools?: ToolDefinition[];  // 工具列表
  toolChoice?: 'auto' | 'any' | { type: 'tool'; name: string };  // 工具选择策略
}
```

- [ ] **Step 6: Add ChatResponseWithTools interface**

Add after `ChatResponse` interface (after line 47):

```typescript
/**
 * 带 Tool Use 的聊天响应
 */
export interface ChatResponseWithTools extends ChatResponse {
  contentBlocks?: ContentBlock[];    // 所有内容块
  toolCalls?: ToolUseBlock[];        // 工具调用列表
}
```

- [ ] **Step 7: Add StreamEvent interface**

Add after `ChatResponseWithTools`:

```typescript
/**
 * 流事件
 */
export interface StreamEvent {
  type: 'text' | 'tool_use_start' | 'tool_use_input' | 'tool_use_end' | 'tool_result' | 'message_stop';
  delta?: string;              // 文本增量
  toolName?: string;           // 工具名称
  toolId?: string;             // 工具 ID
  partialInput?: any;          // 部分输入
  result?: string | ToolResultContent[];  // 工具结果
}
```

- [ ] **Step 8: Add error classes**

Add after `NonRetryableError` class (after line 126):

```typescript
/**
 * 流式响应中断错误
 */
export class StreamInterruptedError extends Error {
  public partialResponse: Partial<ChatResponseWithTools>;

  constructor(
    message: string,
    partialResponse: Partial<ChatResponseWithTools>
  ) {
    super(message);
    this.name = 'StreamInterruptedError';
    this.partialResponse = partialResponse;
  }
}

/**
 * 上下文长度超限错误
 */
export class ContextLengthExceededError extends NonRetryableError {
  constructor(message: string) {
    super(message);
    this.name = 'ContextLengthExceededError';
  }
}
```

- [ ] **Step 9: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 10: Commit types**

```bash
git add src/types/types.ts
git commit -m "feat(types): add Tool Use and Streaming type definitions"
```

---

## Task 2: Update Exports

**Files:**
- Modify: `src/index.ts` (lines 1-28)

- [ ] **Step 1: Export new types**

Replace lines 5-14 with:

```typescript
// Types
export type {
  ProviderConfig,
  ModelConfig,
  ChatMessage,
  ChatResponse,
  ChatResponseWithTools,
  ChatOptions,
  Usage,
  UsageStats,
  Logger,
  ToolDefinition,
  SchemaProperty,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ToolResultContent,
  StreamEvent,
} from './types/types';
```

- [ ] **Step 2: Export new error classes**

Replace lines 17-22 with:

```typescript
// Error classes
export {
  NetworkError,
  HttpError,
  RateLimitError,
  NonRetryableError,
  StreamInterruptedError,
  ContextLengthExceededError,
} from './types/types';
```

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds without errors

- [ ] **Step 4: Commit exports**

```bash
git add src/index.ts
git commit -m "feat(exports): export new Tool Use and Streaming types"
```

---

## Task 3: Add convertMessagesToAnthropic Helper

**Files:**
- Modify: `src/core/ai-client.ts` (add after line 225)

- [ ] **Step 1: Write the failing test**

Add to `src/core/ai-client.test.ts`:

```typescript
describe('AIClient - convertMessagesToAnthropic', () => {
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

  test('should convert string content', () => {
    const messages = [
      { role: 'user' as const, content: 'Hello' }
    ];

    // Access private method via type assertion
    const result = (ai as any).convertMessagesToAnthropic(messages);

    expect(result).toEqual([
      { role: 'user', content: 'Hello' }
    ]);
  });

  test('should convert TextBlock array', () => {
    const messages = [
      {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: 'Hello' }]
      }
    ];

    const result = (ai as any).convertMessagesToAnthropic(messages);

    expect(result).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
    ]);
  });

  test('should convert ToolUseBlock array', () => {
    const messages = [
      {
        role: 'assistant' as const,
        content: [{
          type: 'tool_use' as const,
          id: 'tool_123',
          name: 'get_weather',
          input: { city: 'Beijing' }
        }]
      }
    ];

    const result = (ai as any).convertMessagesToAnthropic(messages);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: 'tool_123',
          name: 'get_weather',
          input: { city: 'Beijing' }
        }]
      }
    ]);
  });

  test('should convert ToolResultBlock array', () => {
    const messages = [
      {
        role: 'user' as const,
        content: [{
          type: 'tool_result' as const,
          tool_use_id: 'tool_123',
          content: 'Sunny, 25°C',
          is_error: false
        }]
      }
    ];

    const result = (ai as any).convertMessagesToAnthropic(messages);

    expect(result).toEqual([
      {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: 'tool_123',
          content: 'Sunny, 25°C',
          is_error: false
        }]
      }
    ]);
  });

  test('should handle ToolResultBlock with array content', () => {
    const messages = [
      {
        role: 'user' as const,
        content: [{
          type: 'tool_result' as const,
          tool_use_id: 'tool_123',
          content: [
            { type: 'text' as const, text: 'Result: ' },
            'Sunny'
          ]
        }]
      }
    ];

    const result = (ai as any).convertMessagesToAnthropic(messages);

    expect(result).toEqual([
      {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: 'tool_123',
          content: [
            { type: 'text', text: 'Result: ' },
            { type: 'text', text: 'Sunny' }
          ]
        }]
      }
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ai-client.test.ts`
Expected: FAIL with "convertMessagesToAnthropic is not a function"

- [ ] **Step 3: Write implementation**

Add after line 225 in `src/core/ai-client.ts`:

```typescript
/**
 * 将 ChatMessage 转换为 Anthropic SDK 格式
 *
 * @param messages - 标准格式的消息列表
 * @returns Anthropic SDK 的 MessageParam 格式
 */
private convertMessagesToAnthropic(
  messages: ChatMessage[]
): Anthropic.Messages.MessageParam[] {
  return messages.map(msg => {
    // 如果 content 是字符串，直接转换
    if (typeof msg.content === 'string') {
      return {
        role: msg.role,
        content: msg.content
      };
    }

    // 如果 content 是内容块数组，转换格式
    return {
      role: msg.role,
      content: msg.content.map(block => {
        if (block.type === 'text') {
          return { type: 'text', text: block.text };
        }

        if (block.type === 'tool_use') {
          return {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input
          };
        }

        if (block.type === 'tool_result') {
          // 确保 content 格式正确
          const content = Array.isArray(block.content)
            ? block.content.map(c => {
                if (typeof c === 'string') {
                  return { type: 'text', text: c };
                }
                return c;
              })
            : block.content;

          return {
            type: 'tool_result',
            tool_use_id: block.tool_use_id,
            content,
            is_error: block.is_error
          };
        }

        // 兜底
        return block;
      })
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ai-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/ai-client.ts src/core/ai-client.test.ts
git commit -m "feat(ai-client): add convertMessagesToAnthropic helper"
```

---

## Task 4: Add extractContentBlocks Helper

**Files:**
- Modify: `src/core/ai-client.ts` (add after convertMessagesToAnthropic)

- [ ] **Step 1: Write the failing test**

Add to `src/core/ai-client.test.ts`:

```typescript
describe('AIClient - extractContentBlocks', () => {
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

  test('should extract text blocks', () => {
    const content = [
      { type: 'text', text: 'Hello' },
      { type: 'text', text: 'World' }
    ];

    const result = (ai as any).extractContentBlocks(content);

    expect(result).toEqual([
      { type: 'text', text: 'Hello' },
      { type: 'text', text: 'World' }
    ]);
  });

  test('should extract tool_use blocks', () => {
    const content = [
      {
        type: 'tool_use',
        id: 'tool_123',
        name: 'get_weather',
        input: { city: 'Beijing' }
      }
    ];

    const result = (ai as any).extractContentBlocks(content);

    expect(result).toEqual([
      {
        type: 'tool_use',
        id: 'tool_123',
        name: 'get_weather',
        input: { city: 'Beijing' }
      }
    ]);
  });

  test('should extract mixed blocks', () => {
    const content = [
      { type: 'text', text: 'Let me check' },
      {
        type: 'tool_use',
        id: 'tool_123',
        name: 'get_weather',
        input: { city: 'Beijing' }
      }
    ];

    const result = (ai as any).extractContentBlocks(content);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: 'text', text: 'Let me check' });
    expect(result[1]).toEqual({
      type: 'tool_use',
      id: 'tool_123',
      name: 'get_weather',
      input: { city: 'Beijing' }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ai-client.test.ts`
Expected: FAIL with "extractContentBlocks is not a function"

- [ ] **Step 3: Write implementation**

Add after `convertMessagesToAnthropic` in `src/core/ai-client.ts`:

```typescript
/**
 * 提取所有内容块（类型安全版本）
 *
 * @param content - Anthropic SDK 的内容块数组
 * @returns 标准化的内容块数组
 */
private extractContentBlocks(
  content: Anthropic.Messages.ContentBlock[]
): ContentBlock[] {
  return content.map((block): ContentBlock => {
    if (block.type === 'text') {
      const textBlock = block as Anthropic.Messages.TextBlock;
      return {
        type: 'text',
        text: textBlock.text
      } as TextBlock;
    }

    if (block.type === 'tool_use') {
      const toolBlock = block as Anthropic.Messages.ToolUseBlock;
      return {
        type: 'tool_use',
        id: toolBlock.id,
        name: toolBlock.name,
        input: toolBlock.input
      } as ToolUseBlock;
    }

    // 兜底：返回原始块
    return block as ContentBlock;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ai-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/ai-client.ts src/core/ai-client.test.ts
git commit -m "feat(ai-client): add extractContentBlocks helper"
```

---

## Task 5: Add buildToolResultMessage Static Method

**Files:**
- Modify: `src/core/ai-client.ts` (add as static method)

- [ ] **Step 1: Write the failing test**

Add to `src/core/ai-client.test.ts`:

```typescript
describe('AIClient - buildToolResultMessage', () => {
  test('should build tool result message with string result', () => {
    const message = AIClient.buildToolResultMessage('tool_123', 'Sunny, 25°C');

    expect(message.role).toBe('user');
    expect(message.content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'tool_123',
        content: 'Sunny, 25°C',
        is_error: false
      }
    ]);
  });

  test('should build tool result message with error flag', () => {
    const message = AIClient.buildToolResultMessage('tool_123', 'Error occurred', true);

    expect(message.role).toBe('user');
    expect(message.content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'tool_123',
        content: 'Error occurred',
        is_error: true
      }
    ]);
  });

  test('should build tool result message with array result', () => {
    const message = AIClient.buildToolResultMessage('tool_123', [
      { type: 'text', text: 'Weather: ' },
      'Sunny'
    ]);

    expect(message.role).toBe('user');
    expect(message.content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'tool_123',
        content: [
          { type: 'text', text: 'Weather: ' },
          'Sunny'
        ],
        is_error: false
      }
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ai-client.test.ts`
Expected: FAIL with "buildToolResultMessage is not a function"

- [ ] **Step 3: Write implementation**

Add as a static method in the `AIClient` class:

```typescript
/**
 * 构建工具结果消息（用于下一轮对话）
 *
 * @param toolUseId - 对应的 tool_use ID
 * @param result - 工具执行结果
 * @param isError - 是否是错误结果
 * @returns 可以直接添加到消息列表的消息对象
 */
static buildToolResultMessage(
  toolUseId: string,
  result: string | ToolResultContent[],
  isError?: boolean
): ChatMessage {
  return {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: result,
        is_error: isError
      }
    ]
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ai-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/ai-client.ts src/core/ai-client.test.ts
git commit -m "feat(ai-client): add buildToolResultMessage static method"
```

---

## Task 6: Add chatWithTools Method

**Files:**
- Modify: `src/core/ai-client.ts` (add after chat method)

**Note:** This task requires integration tests with actual API calls. We'll add unit tests that can be skipped without API keys.

- [ ] **Step 1: Write basic test**

Add to `src/core/ai-client.test.ts`:

```typescript
describe('AIClient - chatWithTools', () => {
  let ai: AIClient;

  beforeEach(() => {
    ai = new AIClient({
      providers: {
        anthropic: {
          baseURL: 'https://api.anthropic.com',
          authToken: process.env.ANTHROPIC_API_KEY || 'test-key',
          authType: 'apiKey',
          models: ['claude-3-5-sonnet-20241022']
        }
      }
    });
  });

  // Skip test if no API key
  const testOrSkip = process.env.ANTHROPIC_API_KEY ? test : test.skip;

  testOrSkip('should return text response without tools', async () => {
    const response = await ai.chatWithTools([
      { role: 'user', content: 'Say "Hello"' }
    ]);

    expect(response.text).toBeDefined();
    expect(response.text.toLowerCase()).toContain('hello');
    expect(response.toolCalls).toEqual([]);
  });

  testOrSkip('should return tool calls when tools provided', async () => {
    const tools = [
      {
        name: 'get_weather',
        description: 'Get current weather',
        input_schema: {
          type: 'object' as const,
          properties: {
            city: { type: 'string', description: 'City name' }
          },
          required: ['city']
        }
      }
    ];

    const response = await ai.chatWithTools(
      [{ role: 'user', content: 'What\'s the weather in Beijing?' }],
      { tools }
    );

    expect(response.toolCalls).toBeDefined();
    expect(response.toolCalls!.length).toBeGreaterThan(0);
    expect(response.toolCalls![0].name).toBe('get_weather');
    expect(response.toolCalls![0].input).toHaveProperty('city');
  });

  testOrSkip('should handle empty tools array', async () => {
    const response = await ai.chatWithTools(
      [{ role: 'user', content: 'Hello' }],
      { tools: [] }
    );

    expect(response.text).toBeDefined();
  });
});
```

- [ ] **Step 2: Write implementation**

Add after the `chat()` method in `src/core/ai-client.ts`:

```typescript
/**
 * 带 Tool Use 的多轮对话
 *
 * @param messages - 对话消息列表
 * @param options - 对话选项（包含工具）
 * @param logger - 可选的日志记录器
 * @returns 完整的对话响应（包含工具调用）
 */
async chatWithTools(
  messages: ChatMessage[],
  options?: ChatOptions,
  logger?: Logger
): Promise<ChatResponseWithTools> {
  logger?.debug('Starting chat with tools', { messages, options });

  // 解析模型
  const { provider, model } = this.resolveModel(options?.model);
  logger?.debug('Resolved model', { provider, model });

  // 获取客户端
  const client = this.getOrCreateClient(provider);

  // 构建请求参数
  const requestParams: Anthropic.Messages.MessageCreateParams = {
    model,
    max_tokens: options?.maxTokens ?? this.DEFAULT_MAX_TOKENS,
    messages: this.convertMessagesToAnthropic(messages),
  };

  // 添加系统提示词
  if (options?.systemPrompt) {
    requestParams.system = options.systemPrompt;
  }

  // 添加工具定义（仅当有工具时）
  if (options?.tools && options.tools.length > 0) {
    requestParams.tools = options.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema as any
    }));

    // 添加工具选择策略
    if (options.toolChoice) {
      if (options.toolChoice === 'auto' || options.toolChoice === 'any') {
        requestParams.tool_choice = { type: options.toolChoice };
      } else {
        requestParams.tool_choice = options.toolChoice;
      }
    }
  }

  logger?.debug('Calling Anthropic API with tools', { requestParams });

  try {
    const response = await executeWithRetry(async () => {
      return await client.messages.create(requestParams);
    });

    logger?.debug('API call successful', { response });

    // 提取所有内容块
    const contentBlocks = this.extractContentBlocks(response.content);

    // 提取文本内容
    const textContent = contentBlocks
      .filter(block => block.type === 'text')
      .map(block => (block as TextBlock).text)
      .join('');

    // 提取工具调用
    const toolCalls = contentBlocks
      .filter(block => block.type === 'tool_use')
      .map(block => block as ToolUseBlock);

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
      contentBlocks,
      toolCalls,
      stopReason: response.stop_reason,
      model: response.model,
      usage,
    };

    logger?.info('Chat with tools completed', {
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      toolCallsCount: toolCalls.length,
    });

    return chatResponse;
  } catch (error) {
    logger?.error('Chat with tools failed', { error });
    this.incrementFailedCalls();
    throw error;
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- ai-client.test.ts`
Expected: Tests pass (or skip if no API key)

- [ ] **Step 4: Commit**

```bash
git add src/core/ai-client.ts src/core/ai-client.test.ts
git commit -m "feat(ai-client): add chatWithTools method"
```

---

## Task 7: Add chatStream Method

**Files:**
- Modify: `src/core/ai-client.ts` (add after chatWithTools)

- [ ] **Step 1: Write basic test**

Add to `src/core/ai-client.test.ts`:

```typescript
describe('AIClient - chatStream', () => {
  let ai: AIClient;

  beforeEach(() => {
    ai = new AIClient({
      providers: {
        anthropic: {
          baseURL: 'https://api.anthropic.com',
          authToken: process.env.ANTHROPIC_API_KEY || 'test-key',
          authType: 'apiKey',
          models: ['claude-3-5-sonnet-20241022']
        }
      }
    });
  });

  const testOrSkip = process.env.ANTHROPIC_API_KEY ? test : test.skip;

  testOrSkip('should stream text content', async () => {
    const events: any[] = [];

    const response = await ai.chatStream(
      [{ role: 'user', content: 'Say "Hello World"' }],
      undefined,
      (event) => events.push(event)
    );

    expect(response.text).toBeDefined();
    expect(response.text.toLowerCase()).toContain('hello');
    expect(events.some(e => e.type === 'text')).toBe(true);
    expect(events.some(e => e.type === 'message_stop')).toBe(true);
  });

  testOrSkip('should stream tool use events', async () => {
    const tools = [
      {
        name: 'get_weather',
        description: 'Get current weather',
        input_schema: {
          type: 'object' as const,
          properties: {
            city: { type: 'string', description: 'City name' }
          },
          required: ['city']
        }
      }
    ];

    const events: any[] = [];

    const response = await ai.chatStream(
      [{ role: 'user', content: 'What\'s the weather in Tokyo?' }],
      { tools },
      (event) => events.push(event)
    );

    // Should have tool use events
    const toolUseStart = events.find(e => e.type === 'tool_use_start');
    const toolUseEnd = events.find(e => e.type === 'tool_use_end');

    expect(toolUseStart).toBeDefined();
    expect(toolUseEnd).toBeDefined();
    expect(response.toolCalls).toBeDefined();
    expect(response.toolCalls!.length).toBeGreaterThan(0);
  });

  testOrSkip('should handle mixed content (text + tool_use)', async () => {
    const tools = [
      {
        name: 'get_weather',
        description: 'Get weather',
        input_schema: {
          type: 'object' as const,
          properties: {
            city: { type: 'string' }
          },
          required: ['city']
        }
      }
    ];

    const response = await ai.chatStream(
      [{ role: 'user', content: 'Check weather and say hello' }],
      { tools }
    );

    expect(response.contentBlocks).toBeDefined();
    expect(response.contentBlocks!.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Write implementation**

Add after `chatWithTools()` method:

```typescript
/**
 * 流式对话（支持 Tool Use）
 *
 * @param messages - 对话消息列表
 * @param options - 对话选项
 * @param onEvent - 事件回调函数
 * @param logger - 可选的日志记录器
 * @returns 最终响应
 */
async chatStream(
  messages: ChatMessage[],
  options?: ChatOptions,
  onEvent?: (event: StreamEvent) => void,
  logger?: Logger
): Promise<ChatResponseWithTools> {
  logger?.debug('Starting streaming chat', { messages, options });

  const { provider, model } = this.resolveModel(options?.model);
  const client = this.getOrCreateClient(provider);

  const requestParams: Anthropic.Messages.MessageCreateParams = {
    model,
    max_tokens: options?.maxTokens ?? this.DEFAULT_MAX_TOKENS,
    messages: this.convertMessagesToAnthropic(messages),
  };

  if (options?.systemPrompt) {
    requestParams.system = options.systemPrompt;
  }

  if (options?.tools && options.tools.length > 0) {
    requestParams.tools = options.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema as any
    }));
  }

  logger?.debug('Starting Anthropic streaming API', { requestParams });

  // 创建流式请求
  const stream = client.messages.stream(requestParams);

  // 收集内容（使用数组维护顺序）
  const contentBlocks: ContentBlock[] = [];
  const toolCalls: ToolUseBlock[] = [];

  // 临时存储当前正在处理的内容块
  let currentTextBlock: TextBlock | null = null;
  let currentToolCall: ToolUseBlock | null = null;

  try {
    // 处理内容块开始
    stream.on('contentBlockStart', (event) => {
      if (event.content_block.type === 'text') {
        currentTextBlock = { type: 'text', text: '' };
      } else if (event.content_block.type === 'tool_use') {
        const toolBlock = event.content_block as Anthropic.Messages.ToolUseBlock;
        currentToolCall = {
          type: 'tool_use',
          id: toolBlock.id,
          name: toolBlock.name,
          input: {}
        };

        if (onEvent) {
          onEvent({
            type: 'tool_use_start',
            toolName: toolBlock.name,
            toolId: toolBlock.id
          });
        }
      }
    });

    // 处理文本增量
    stream.on('text', (text) => {
      if (currentTextBlock) {
        currentTextBlock.text += text;
      }

      if (onEvent) {
        onEvent({ type: 'text', delta: text });
      }
    });

    // 处理工具输入增量
    stream.on('inputJson', (partialJson, snapshot) => {
      if (currentToolCall) {
        currentToolCall.input = snapshot;
      }

      if (onEvent) {
        onEvent({
          type: 'tool_use_input',
          toolId: currentToolCall?.id,
          partialInput: snapshot
        });
      }
    });

    // 处理内容块结束
    stream.on('contentBlockStop', (event) => {
      if (currentTextBlock && currentTextBlock.text) {
        contentBlocks.push(currentTextBlock);
        currentTextBlock = null;
      }

      if (currentToolCall) {
        contentBlocks.push(currentToolCall);
        toolCalls.push(currentToolCall);

        if (onEvent) {
          onEvent({
            type: 'tool_use_end',
            toolId: currentToolCall.id,
            toolName: currentToolCall.name
          });
        }

        currentToolCall = null;
      }
    });

    // 等待流完成
    const finalMessage = await stream.finalMessage();

    // 提取文本内容（合并所有文本块）
    const textContent = contentBlocks
      .filter(block => block.type === 'text')
      .map(block => (block as TextBlock).text)
      .join('');

    // 转换用量统计
    const usage: Usage = {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    };

    this.updateUsageStats(model, usage);
    this.incrementSuccessCalls();

    const response: ChatResponseWithTools = {
      text: textContent,
      contentBlocks,
      toolCalls,
      stopReason: finalMessage.stop_reason,
      model: finalMessage.model,
      usage,
    };

    logger?.info('Streaming chat completed', {
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      toolCallsCount: toolCalls.length,
      contentBlocksCount: contentBlocks.length,
    });

    return response;
  } catch (error) {
    // 流中断错误处理
    const partialResponse: Partial<ChatResponseWithTools> = {
      text: contentBlocks
        .filter(block => block.type === 'text')
        .map(block => (block as TextBlock).text)
        .join(''),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
    };

    logger?.error('Streaming chat failed', { error, partialResponse });

    // 包装为 StreamInterruptedError
    if (error instanceof Error) {
      throw new StreamInterruptedError(
        error.message,
        partialResponse
      );
    }
    throw error;
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- ai-client.test.ts`
Expected: Tests pass (or skip if no API key)

- [ ] **Step 4: Commit**

```bash
git add src/core/ai-client.ts src/core/ai-client.test.ts
git commit -m "feat(ai-client): add chatStream method with event-based streaming"
```

---

## Task 8: Update README Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update features list**

Replace lines 5-13 with:

```markdown
## Features

- **Multi-Provider Routing** - Specify service provider and model using `"provider/model"` format
- **Automatic Retry** - Up to 3 retries for network errors, up to 20 retries for HTTP errors
- **Exponential Backoff** - `500ms * 2^n + jitter` algorithm with 24-hour maximum
- **JSON Extraction** - Handles markdown code blocks, trailing commas, and comments in LLM output
- **Multiple Configuration Methods** - Direct config, config files, or environment variables
- **Tool Use Support** ✨ NEW - Full support for Anthropic's Tool Use API with manual loop control
- **Streaming Responses** ✨ NEW - Real-time streaming with event-based callbacks
- **Usage Statistics** - Automatic tracking of call counts and token consumption
```

- [ ] **Step 2: Add Tool Use example**

Add after line 65 (after the quick start example):

```markdown
### Tool Use Example

\`\`\`typescript
import { AIClient, ToolDefinition } from 'latte-ts-models';

const ai = new AIClient({ /* config */ });

// Define tools
const tools: ToolDefinition[] = [
  {
    name: 'get_weather',
    description: 'Get current weather for a city',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' }
      },
      required: ['city']
    }
  }
];

// Initial message
const messages = [
  { role: 'user', content: 'What\'s the weather in Beijing?' }
];

// Call with tools
let response = await ai.chatWithTools(messages, { tools });

// Handle tool calls
while (response.toolCalls && response.toolCalls.length > 0) {
  for (const toolCall of response.toolCalls) {
    // Execute tool
    const result = await executeTool(toolCall.name, toolCall.input);

    // Add assistant message
    messages.push({
      role: 'assistant',
      content: response.contentBlocks!
    });

    // Add tool result
    messages.push(AIClient.buildToolResultMessage(toolCall.id, result));
  }

  // Continue conversation
  response = await ai.chatWithTools(messages, { tools });
}

console.log(response.text);
\`\`\`

### Streaming Example

\`\`\`typescript
const response = await ai.chatStream(
  messages,
  { tools },
  (event) => {
    switch (event.type) {
      case 'text':
        process.stdout.write(event.delta);
        break;
      case 'tool_use_start':
        console.log(`\nCalling tool: ${event.toolName}`);
        break;
      case 'tool_use_input':
        // Show partial tool parameters in real-time
        break;
      case 'tool_use_end':
        console.log(`\nTool ${event.toolName} ready to execute`);
        break;
    }
  }
);
\`\`\`
```

- [ ] **Step 3: Update API Reference**

Add after line 96 (after the Methods section):

```markdown
#### `chatWithTools(messages, options?, logger?)`

Execute a multi-turn conversation with Tool Use support.

**Parameters:**
- `messages: ChatMessage[]` - Conversation messages
- `options?: ChatOptions` - Chat options including tools
- `logger?: Logger` - Optional logger

**Returns:** `Promise<ChatResponseWithTools>`

#### `chatStream(messages, options?, onEvent?, logger?)`

Execute a streaming conversation with Tool Use support.

**Parameters:**
- `messages: ChatMessage[]` - Conversation messages
- `options?: ChatOptions` - Chat options
- `onEvent?: (event: StreamEvent) => void` - Event callback
- `logger?: Logger` - Optional logger

**Returns:** `Promise<ChatResponseWithTools>`

#### `AIClient.buildToolResultMessage(toolUseId, result, isError?)`

Build a tool result message for the next conversation turn.

**Parameters:**
- `toolUseId: string` - The tool_use ID to respond to
- `result: string | ToolResultContent[]` - Tool execution result
- `isError?: boolean` - Whether the result is an error

**Returns:** `ChatMessage`
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README with Tool Use and Streaming examples"
```

---

## Task 9: Run Full Test Suite

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds without errors

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: No type errors

---

## Self-Review

After completing all tasks, verify:

1. **Spec coverage:**
   - ✅ Type definitions (Task 1)
   - ✅ Exports (Task 2)
   - ✅ Helper methods (Tasks 3, 4, 5)
   - ✅ Main methods (Tasks 6, 7)
   - ✅ Documentation (Task 8)

2. **No placeholders:**
   - ✅ All code blocks are complete
   - ✅ All tests have actual assertions
   - ✅ All file paths are exact
   - ✅ All commands are specific

3. **Type consistency:**
   - ✅ `TextBlock`, `ToolUseBlock`, `ToolResultBlock` used consistently
   - ✅ `ChatMessage` with `string | ContentBlock[]` throughout
   - ✅ `ChatResponseWithTools` returned by both new methods
   - ✅ `StreamEvent` type matches event emissions

---

## Completion

After all tasks pass:

```bash
git add -A
git commit -m "feat: complete Tool Use and Streaming support

- Add comprehensive type definitions for Tool Use
- Implement chatWithTools and chatStream methods
- Add helper methods for message conversion
- Update README with usage examples
- Maintain backward compatibility"
```
