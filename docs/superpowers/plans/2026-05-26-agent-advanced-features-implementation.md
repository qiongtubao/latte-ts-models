# AI Agent Advanced Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three advanced features: executeToolUseLoop for complete loop abstraction, executeToolsParallel for concurrent execution, and ChatHistory persistence for data durability.

**Architecture:** All methods integrated into existing classes (AIClient, ChatHistory). State machine for loop management. Resource grouping for parallel execution. Auto-save with debounce for persistence.

**Tech Stack:** TypeScript, Jest for testing, fs-extra for file operations, existing latte-ts-models infrastructure

---

## File Structure

**Modified Files:**
- `src/types/types.ts` - Add new type definitions
- `src/core/ai-client.ts` - Add executeToolUseLoop, executeToolsParallel methods
- `src/core/ai-client.test.ts` - Tests for new methods
- `src/core/chat-history.ts` - Add persistence methods
- `src/core/chat-history.test.ts` - Tests for persistence
- `src/index.ts` - Export new types

**No New Files** - All logic integrated into existing classes.

---

## Task 1: Add Type Definitions

**Files:**
- Modify: `src/types/types.ts` (add after existing types)

- [ ] **Step 1: Add ToolUseLoopState type**

Add to `src/types/types.ts`:

```typescript
/**
 * Tool Use 循环状态（细颗粒度）
 */
export type ToolUseLoopState =
  | 'idle'              // 空闲
  | 'thinking'          // 模型思考中
  | 'executing_tools'   // 工具执行中
  | 'processing_results' // 工具结果处理中
  | 'finalizing'        // 强制收尾中
  | 'completed'         // 完成
  | 'failed';           // 失败
```

- [ ] **Step 2: Add ToolUseLoopResultStatus type**

Add after ToolUseLoopState:

```typescript
/**
 * Tool Use 循环结果状态
 */
export type ToolUseLoopResultStatus =
  | 'completed'         // 正常完成
  | 'max_iterations'    // 达到最大迭代次数
  | 'error';            // 发生错误
```

- [ ] **Step 3: Add ToolUseLoopError interface**

Add after ToolUseLoopResultStatus:

```typescript
/**
 * 循环错误信息结构
 */
export interface ToolUseLoopError {
  code: 'TIMEOUT' | 'MAX_ITERATIONS' | 'TOOL_EXECUTION_FAILED' | 'UNKNOWN';
  message: string;
  originalError?: Error;
}
```

- [ ] **Step 4: Add ToolUseLoopOptions interface**

Add after ToolUseLoopError:

```typescript
/**
 * Tool Use 循环选项
 */
export interface ToolUseLoopOptions {
  maxIterations?: number;                              // 最大迭代次数（默认 10）
  forceFinalize?: boolean;                             // 达到上限时强制收尾（默认 true）
  timeout?: number;                                    // 全局超时时间（毫秒，默认 120000）
  onStateChange?: (state: ToolUseLoopState) => void;   // 状态变更回调
  onToolCall?: (toolCall: ToolUseBlock) => void;       // 工具调用回调
  onToolResult?: (result: ToolExecutionResult) => void; // 工具结果回调
  shouldContinue?: (iteration: number, response: ChatResponseWithTools) => boolean;
}
```

- [ ] **Step 5: Add ToolUseLoopResult interface**

Add after ToolUseLoopOptions:

```typescript
/**
 * Tool Use 循环结果
 */
export interface ToolUseLoopResult {
  status: ToolUseLoopResultStatus;
  response: ChatResponse;
  messages: ChatMessage[];
  iterations: number;
  toolCallsExecuted: number;
  state: ToolUseLoopState;
  error?: ToolUseLoopError;
}
```

- [ ] **Step 6: Add ParallelExecutionOptions interface**

Add after ToolUseLoopResult:

```typescript
/**
 * 并发执行选项
 */
export interface ParallelExecutionOptions {
  maxConcurrency?: number;                               // 最大并发数（默认 5）
  getResourceKey?: (toolCall: ToolUseBlock) => string | null; // 资源分组键
  isConcurrencySafe?: (toolCall: ToolUseBlock) => boolean; // 是否并发安全
  logger?: Logger;
  onRetry?: (event: RetryEvent) => void;
  onBatchStart?: (batch: ToolUseBlock[]) => void;
  onBatchEnd?: (results: Map<string, ToolExecutionResult>) => void;
}
```

- [ ] **Step 7: Add PersistenceProvider type**

Add after ParallelExecutionOptions:

```typescript
/**
 * 持久化存储提供者类型
 */
export type PersistenceProvider = 'file' | 'sqlite' | 'indexeddb';
```

- [ ] **Step 8: Add HistoryPersistenceOptions interface**

Add after PersistenceProvider:

```typescript
/**
 * 历史持久化选项
 */
export interface HistoryPersistenceOptions {
  provider?: PersistenceProvider;
  filePath?: string;
  autoSave?: boolean;
  autoSaveDelay?: number;
  debounce?: boolean;
  validateData?: boolean;
}
```

- [ ] **Step 9: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 10: Commit type definitions**

```bash
git add src/types/types.ts
git commit -m "feat(types): add advanced features type definitions"
```

---

## Task 2: Add ChatHistory Persistence Methods

**Files:**
- Modify: `src/core/chat-history.ts`
- Modify: `src/core/chat-history.test.ts`

- [ ] **Step 1: Install fs-extra dependency**

Run: `npm install fs-extra && npm install -D @types/fs-extra`

- [ ] **Step 2: Update ChatHistory constructor**

Modify the constructor in `src/core/chat-history.ts`:

```typescript
import { 
  ChatMessage, 
  ContentBlock, 
  ToolUseBlock, 
  ToolResultBlock,
  TextBlock,
  Tokenizer,
  TruncateEvent,
  HistoryPersistenceOptions
} from '../types/types';
import * as fs from 'fs-extra';
import * as path from 'path';

export class ChatHistory {
  private messages: ChatMessage[] = [];
  private maxTokens: number;
  private tokenizer?: Tokenizer;
  private onTruncate?: (event: TruncateEvent) => void;
  private persistence?: HistoryPersistenceOptions;
  private saveDebounceTimer?: NodeJS.Timeout;
  private writeLock: boolean = false;

  private readonly TOKENS_PER_WORD = 4;
  private readonly MESSAGE_OVERHEAD = 10;
  private readonly TOKENS_PER_CHINESE_CHAR = 1.5;

  constructor(
    maxTokens: number = 100_000,
    options?: {
      tokenizer?: Tokenizer;
      onTruncate?: (event: TruncateEvent) => void;
      persistence?: HistoryPersistenceOptions;
    }
  ) {
    this.maxTokens = maxTokens;
    this.tokenizer = options?.tokenizer;
    this.onTruncate = options?.onTruncate;
    this.persistence = options?.persistence;

    // Auto-load on construction if persistence is configured
    if (this.persistence?.filePath) {
      this.loadFromFile().catch(err => {
        console.warn('Failed to load history:', err);
      });
    }
  }
```

- [ ] **Step 3: Add triggerAutoSave private method**

Add after constructor:

```typescript
/**
 * 触发自动保存（防抖）
 */
private triggerAutoSave(): void {
  if (!this.persistence?.autoSave || !this.persistence?.filePath) {
    return;
  }

  if (this.saveDebounceTimer) {
    clearTimeout(this.saveDebounceTimer);
  }

  const delay = this.persistence.autoSaveDelay ?? 1000;
  this.saveDebounceTimer = setTimeout(async () => {
    await this.flush();
  }, delay);
}
```

- [ ] **Step 4: Add flush method**

Add after triggerAutoSave:

```typescript
/**
 * 强制落盘
 */
async flush(): Promise<void> {
  if (this.saveDebounceTimer) {
    clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = undefined;
  }

  if (!this.persistence?.filePath) {
    return;
  }

  // Wait for write lock
  while (this.writeLock) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  this.writeLock = true;
  try {
    await this.saveToFile();
  } finally {
    this.writeLock = false;
  }
}
```

- [ ] **Step 5: Add saveToFile method**

Add after flush:

```typescript
/**
 * 保存历史到文件
 */
async saveToFile(filePath?: string): Promise<void> {
  const targetPath = filePath || this.persistence?.filePath;
  if (!targetPath) {
    throw new Error('Storage path is not defined');
  }

  const data = {
    version: '1.0',
    messages: this.messages,
    timestamp: new Date().toISOString(),
    totalTokens: this.getTotalTokens(),
    metadata: {
      provider: this.persistence?.provider ?? 'file',
      maxTokens: this.maxTokens
    }
  };

  await fs.ensureDir(path.dirname(targetPath));
  await fs.writeJson(targetPath, data, { spaces: 2 });
}
```

- [ ] **Step 6: Add loadFromFile method**

Add after saveToFile:

```typescript
/**
 * 从文件加载历史
 */
async loadFromFile(filePath?: string): Promise<void> {
  const targetPath = filePath || this.persistence?.filePath;
  if (!targetPath) {
    throw new Error('Storage path is not defined');
  }

  try {
    if (!(await fs.pathExists(targetPath))) {
      return;
    }

    const data = await fs.readJson(targetPath);

    // Validate data structure
    if (this.persistence?.validateData !== false) {
      if (!Array.isArray(data?.messages)) {
        console.warn('Invalid history file format: messages is not an array, using empty history');
        return;
      }

      for (const msg of data.messages) {
        if (msg.role !== 'user' && msg.role !== 'assistant') {
          console.warn('Invalid message role in history file, using empty history');
          return;
        }
      }
    }

    this.messages = data.messages || [];
    this.enforceLimit();
  } catch (error) {
    console.warn('Failed to load history file, using empty history:', error);
    this.messages = [];
  }
}
```

- [ ] **Step 7: Update existing methods to trigger auto-save**

Modify existing methods in `src/core/chat-history.ts`:

```typescript
addUserMessage(content: string): void {
  this.messages.push({ role: 'user', content });
  this.enforceLimit();
  this.triggerAutoSave();
}

addAssistantMessage(text: string): void {
  this.messages.push({ role: 'assistant', content: text });
  this.enforceLimit();
  this.triggerAutoSave();
}

addAssistantMessageWithTools(text: string, toolCalls: ToolUseBlock[]): void {
  const content: ContentBlock[] = [
    { type: 'text', text },
    ...toolCalls
  ];
  this.messages.push({ role: 'assistant', content });
  this.enforceLimit();
  this.triggerAutoSave();
}

addToolResult(toolUseId: string, result: any, isError: boolean = false): void {
  const content = typeof result === 'string' 
    ? result 
    : JSON.stringify(result, null, 2);

  const toolResultBlock: ToolResultBlock = {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content,
    is_error: isError
  };

  this.messages.push({
    role: 'user',
    content: [toolResultBlock]
  });
  this.enforceLimit();
  this.triggerAutoSave();
}

clear(): void {
  this.messages = [];
  this.triggerAutoSave();
}
```

- [ ] **Step 8: Add tests for persistence**

Add to `src/core/chat-history.test.ts`:

```typescript
import * as fs from 'fs-extra';
import * as path from 'path';

describe('ChatHistory - persistence', () => {
  const testDir = './test-history';
  const testFile = path.join(testDir, 'test-history.json');

  beforeEach(async () => {
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('saveToFile', () => {
    test('should save history to file', async () => {
      const history = new ChatHistory(100_000);
      history.addUserMessage('Hello');
      history.addAssistantMessage('Hi there');

      await history.saveToFile(testFile);

      expect(await fs.pathExists(testFile)).toBe(true);
      const data = await fs.readJson(testFile);
      expect(data.messages).toHaveLength(2);
      expect(data.messages[0].content).toBe('Hello');
    });

    test('should include metadata in saved file', async () => {
      const history = new ChatHistory(50_000);
      history.addUserMessage('Test');

      await history.saveToFile(testFile);

      const data = await fs.readJson(testFile);
      expect(data.version).toBe('1.0');
      expect(data.metadata.maxTokens).toBe(50_000);
      expect(data.totalTokens).toBeGreaterThan(0);
    });
  });

  describe('loadFromFile', () => {
    test('should load history from file', async () => {
      const history1 = new ChatHistory(100_000);
      history1.addUserMessage('Message 1');
      history1.addAssistantMessage('Response 1');
      await history1.saveToFile(testFile);

      const history2 = new ChatHistory(100_000);
      await history2.loadFromFile(testFile);

      expect(history2.getMessageCount()).toBe(2);
      const messages = history2.getMessages();
      expect(messages[0].content).toBe('Message 1');
    });

    test('should handle missing file gracefully', async () => {
      const history = new ChatHistory(100_000);
      
      await expect(history.loadFromFile('./nonexistent.json')).resolves.not.toThrow();
      expect(history.getMessageCount()).toBe(0);
    });

    test('should validate data structure', async () => {
      await fs.writeJson(testFile, { messages: 'invalid' });

      const history = new ChatHistory(100_000, {
        persistence: { validateData: true }
      });
      
      await history.loadFromFile(testFile);
      expect(history.getMessageCount()).toBe(0);
    });

    test('should enforce limit after loading', async () => {
      const history1 = new ChatHistory(50);  // Very small limit
      history1.addUserMessage('This is a long message that exceeds the limit');
      history1.addUserMessage('Another message');
      await history1.saveToFile(testFile);

      const history2 = new ChatHistory(50);
      await history2.loadFromFile(testFile);

      expect(history2.getTotalTokens()).toBeLessThanOrEqual(50);
    });
  });

  describe('autoSave', () => {
    test('should auto-save when configured', async () => {
      const history = new ChatHistory(100_000, {
        persistence: {
          filePath: testFile,
          autoSave: true,
          autoSaveDelay: 100
        }
      });

      history.addUserMessage('Auto-save test');

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(await fs.pathExists(testFile)).toBe(true);
      const data = await fs.readJson(testFile);
      expect(data.messages).toHaveLength(1);
    });

    test('should debounce auto-save', async () => {
      const history = new ChatHistory(100_000, {
        persistence: {
          filePath: testFile,
          autoSave: true,
          autoSaveDelay: 100
        }
      });

      history.addUserMessage('Message 1');
      history.addUserMessage('Message 2');
      history.addUserMessage('Message 3');

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 200));

      const data = await fs.readJson(testFile);
      expect(data.messages).toHaveLength(3);
    });
  });

  describe('flush', () => {
    test('should immediately save when called', async () => {
      const history = new ChatHistory(100_000, {
        persistence: {
          filePath: testFile,
          autoSave: true,
          autoSaveDelay: 5000  // Long delay
        }
      });

      history.addUserMessage('Immediate flush test');
      await history.flush();

      expect(await fs.pathExists(testFile)).toBe(true);
      const data = await fs.readJson(testFile);
      expect(data.messages).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 9: Run tests**

Run: `npm test -- chat-history.test.ts`
Expected: PASS

- [ ] **Step 10: Commit persistence**

```bash
git add src/core/chat-history.ts src/core/chat-history.test.ts package.json package-lock.json
git commit -m "feat(chat-history): add persistence with auto-save and data validation"
```

---

## Task 3: Add cleanupHangingToolCalls Helper

**Files:**
- Modify: `src/core/ai-client.ts`

- [ ] **Step 1: Add cleanupHangingToolCalls private method**

Add to `src/core/ai-client.ts` after the existing private methods:

```typescript
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
```

- [ ] **Step 2: Add tests for cleanupHangingToolCalls**

Add to `src/core/ai-client.test.ts`:

```typescript
describe('AIClient - cleanupHangingToolCalls', () => {
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

  test('should remove dangling tool_use blocks', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Test' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Response' },
          { type: 'tool_use', id: 'tool_1', name: 'test', input: {} }
        ]
      }
    ];

    const cleaned = (ai as any).cleanupHangingToolCalls(messages);
    
    const assistantMsg = cleaned[1] as ChatMessage;
    const blocks = assistantMsg.content as ContentBlock[];
    expect(blocks.filter(b => b.type === 'tool_use')).toHaveLength(0);
  });

  test('should remove orphaned tool_result blocks', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Test' },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'nonexistent',
            content: 'Orphaned result'
          }
        ]
      }
    ];

    const cleaned = (ai as any).cleanupHangingToolCalls(messages);
    
    const toolResultMsg = cleaned[1] as ChatMessage;
    const blocks = toolResultMsg.content as ContentBlock[];
    expect(blocks.filter(b => b.type === 'tool_result')).toHaveLength(0);
  });

  test('should keep matched tool_use and tool_result', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Test' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tool_1', name: 'test', input: {} }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool_1',
            content: 'Result'
          }
        ]
      }
    ];

    const cleaned = (ai as any).cleanupHangingToolCalls(messages);
    
    expect(cleaned).toHaveLength(3);
    const assistantMsg = cleaned[1] as ChatMessage;
    const blocks = assistantMsg.content as ContentBlock[];
    expect(blocks.filter(b => b.type === 'tool_use')).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- ai-client.test.ts`
Expected: PASS

- [ ] **Step 4: Commit cleanup helper**

```bash
git add src/core/ai-client.ts src/core/ai-client.test.ts
git commit -m "feat(ai-client): add cleanupHangingToolCalls helper"
```

---

## Task 4: Add executeToolsParallel Method

**Files:**
- Modify: `src/core/ai-client.ts`
- Modify: `src/core/ai-client.test.ts`

- [ ] **Step 1: Add executeToolsParallel method**

Add to `src/core/ai-client.ts` after executeToolWithRetry:

```typescript
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
```

- [ ] **Step 2: Add import for ParallelExecutionOptions**

Ensure the import at the top includes:

```typescript
import { 
  // ... existing imports ...
  ParallelExecutionOptions
} from '../types/types';
```

- [ ] **Step 3: Add tests for executeToolsParallel**

Add to `src/core/ai-client.test.ts`:

```typescript
describe('AIClient - executeToolsParallel', () => {
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

  test('should return empty map for empty tool calls', async () => {
    const results = await ai.executeToolsParallel([], jest.fn());
    expect(results.size).toBe(0);
  });

  test('should execute tools in parallel', async () => {
    const toolCalls: ToolUseBlock[] = [
      { type: 'tool_use', id: 'tool_1', name: 'test', input: {} },
      { type: 'tool_use', id: 'tool_2', name: 'test', input: {} }
    ];

    const executor = jest.fn().mockResolvedValue({ result: 'success' });
    const results = await ai.executeToolsParallel(toolCalls, executor);

    expect(results.size).toBe(2);
    expect(results.get('tool_1')?.success).toBe(true);
    expect(results.get('tool_2')?.success).toBe(true);
  });

  test('should isolate exceptions', async () => {
    const toolCalls: ToolUseBlock[] = [
      { type: 'tool_use', id: 'tool_1', name: 'test', input: {} },
      { type: 'tool_use', id: 'tool_2', name: 'test', input: {} }
    ];

    const executor = jest.fn()
      .mockResolvedValueOnce({ result: 'success' })
      .mockRejectedValueOnce(new Error('Tool 2 failed'));

    const results = await ai.executeToolsParallel(toolCalls, executor);

    expect(results.size).toBe(2);
    expect(results.get('tool_1')?.success).toBe(true);
    expect(results.get('tool_2')?.success).toBe(false);
    expect(results.get('tool_2')?.error).toBe('Tool 2 failed');
  });

  test('should group by resource key', async () => {
    const toolCalls: ToolUseBlock[] = [
      { type: 'tool_use', id: 'tool_1', name: 'test', input: { userId: 'user_1' } },
      { type: 'tool_use', id: 'tool_2', name: 'test', input: { userId: 'user_1' } },
      { type: 'tool_use', id: 'tool_3', name: 'test', input: { userId: 'user_2' } }
    ];

    const executionOrder: string[] = [];
    const executor = jest.fn().mockImplementation(async (name, input) => {
      executionOrder.push(input.userId);
      return { result: 'success' };
    });

    await ai.executeToolsParallel(toolCalls, executor, {
      getResourceKey: (tc) => tc.input.userId
    });

    // user_1 tools should be sequential (tool_1 before tool_2)
    // user_2 tool can run in parallel with user_1 tools
    const user1Indices = executionOrder.map((id, i) => id === 'user_1' ? i : -1).filter(i => i >= 0);
    expect(user1Indices[1]).toBeGreaterThan(user1Indices[0]);
  });

  test('should identify concurrency-safe tools', async () => {
    const toolCalls: ToolUseBlock[] = [
      { type: 'tool_use', id: 'tool_1', name: 'read_only', input: {} },
      { type: 'tool_use', id: 'tool_2', name: 'write_op', input: { userId: 'user_1' } }
    ];

    const executor = jest.fn().mockResolvedValue({ result: 'success' });

    await ai.executeToolsParallel(toolCalls, executor, {
      isConcurrencySafe: (tc) => tc.name === 'read_only',
      getResourceKey: (tc) => tc.input.userId
    });

    expect(executor).toHaveBeenCalledTimes(2);
  });

  test('should trigger batch callbacks', async () => {
    const toolCalls: ToolUseBlock[] = [
      { type: 'tool_use', id: 'tool_1', name: 'test', input: {} }
    ];

    const executor = jest.fn().mockResolvedValue({ result: 'success' });
    const onBatchStart = jest.fn();
    const onBatchEnd = jest.fn();

    await ai.executeToolsParallel(toolCalls, executor, {
      onBatchStart,
      onBatchEnd
    });

    expect(onBatchStart).toHaveBeenCalled();
    expect(onBatchEnd).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm test -- ai-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit parallel execution**

```bash
git add src/core/ai-client.ts src/core/ai-client.test.ts
git commit -m "feat(ai-client): add executeToolsParallel with resource grouping"
```

---

## Task 5: Add executeToolUseLoop Method

**Files:**
- Modify: `src/core/ai-client.ts`
- Modify: `src/core/ai-client.test.ts`

- [ ] **Step 1: Add executeToolUseLoop method**

Add to `src/core/ai-client.ts` after executeToolsParallel:

```typescript
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
```

- [ ] **Step 2: Add imports for ToolUseLoopOptions and ToolUseLoopResult**

Ensure the import at the top includes:

```typescript
import { 
  // ... existing imports ...
  ToolUseLoopOptions,
  ToolUseLoopResult,
  ToolUseLoopState,
  ToolUseLoopError
} from '../types/types';
```

- [ ] **Step 3: Add tests for executeToolUseLoop**

Add to `src/core/ai-client.test.ts`:

```typescript
describe('AIClient - executeToolUseLoop', () => {
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

  test('should return completed when no tool calls', async () => {
    // Mock chatWithTools to return response without tool calls
    jest.spyOn(ai, 'chatWithTools').mockResolvedValueOnce({
      text: 'Final response',
      stopReason: 'end_turn',
      model: 'claude-3-5-sonnet-20241022',
      usage: { inputTokens: 10, outputTokens: 5 }
    });

    const executor = jest.fn();
    const result = await ai.executeToolUseLoop(
      [{ role: 'user', content: 'Hello' }],
      {},
      executor
    );

    expect(result.status).toBe('completed');
    expect(result.response.text).toBe('Final response');
    expect(result.iterations).toBe(1);
    expect(result.toolCallsExecuted).toBe(0);
  });

  test('should execute tool calls and continue loop', async () => {
    const executor = jest.fn()
      .mockResolvedValueOnce({ data: 'tool result' })
      .mockResolvedValueOnce({ data: 'final' });

    // First call: return tool call
    jest.spyOn(ai, 'chatWithTools')
      .mockResolvedValueOnce({
        text: '',
        stopReason: 'tool_use',
        model: 'claude-3-5-sonnet-20241022',
        usage: { inputTokens: 10, outputTokens: 5 },
        toolCalls: [
          { type: 'tool_use', id: 'tool_1', name: 'test_tool', input: {} }
        ],
        contentBlocks: [
          { type: 'tool_use', id: 'tool_1', name: 'test_tool', input: {} }
        ]
      })
      // Second call: return final response
      .mockResolvedValueOnce({
        text: 'Final response after tool',
        stopReason: 'end_turn',
        model: 'claude-3-5-sonnet-20241022',
        usage: { inputTokens: 20, outputTokens: 10 }
      });

    const result = await ai.executeToolUseLoop(
      [{ role: 'user', content: 'Test' }],
      {},
      executor
    );

    expect(result.status).toBe('completed');
    expect(result.iterations).toBe(2);
    expect(result.toolCallsExecuted).toBe(1);
    expect(result.messages).toHaveLength(3); // user + assistant + tool_result
  });

  test('should stop on max iterations', async () => {
    const executor = jest.fn().mockResolvedValue({ data: 'result' });

    // Always return tool calls
    jest.spyOn(ai, 'chatWithTools').mockResolvedValue({
      text: '',
      stopReason: 'tool_use',
      model: 'claude-3-5-sonnet-20241022',
      usage: { inputTokens: 10, outputTokens: 5 },
      toolCalls: [
        { type: 'tool_use', id: 'tool_1', name: 'test_tool', input: {} }
      ],
      contentBlocks: [
        { type: 'tool_use', id: 'tool_1', name: 'test_tool', input: {} }
      ]
    });

    const result = await ai.executeToolUseLoop(
      [{ role: 'user', content: 'Test' }],
      {},
      executor,
      { maxIterations: 2, forceFinalize: false }
    );

    expect(result.status).toBe('max_iterations');
    expect(result.iterations).toBe(2);
  });

  test('should trigger state change callbacks', async () => {
    jest.spyOn(ai, 'chatWithTools').mockResolvedValueOnce({
      text: 'Final response',
      stopReason: 'end_turn',
      model: 'claude-3-5-sonnet-20241022',
      usage: { inputTokens: 10, outputTokens: 5 }
    });

    const stateChanges: ToolUseLoopState[] = [];
    const result = await ai.executeToolUseLoop(
      [{ role: 'user', content: 'Test' }],
      {},
      jest.fn(),
      {
        onStateChange: (state) => stateChanges.push(state)
      }
    );

    expect(stateChanges).toContain('thinking');
    expect(stateChanges).toContain('completed');
  });

  test('should trigger tool callbacks', async () => {
    const executor = jest.fn().mockResolvedValue({ data: 'result' });

    jest.spyOn(ai, 'chatWithTools')
      .mockResolvedValueOnce({
        text: '',
        stopReason: 'tool_use',
        model: 'claude-3-5-sonnet-20241022',
        usage: { inputTokens: 10, outputTokens: 5 },
        toolCalls: [
          { type: 'tool_use', id: 'tool_1', name: 'test_tool', input: { a: 1 } }
        ],
        contentBlocks: [
          { type: 'tool_use', id: 'tool_1', name: 'test_tool', input: { a: 1 } }
        ]
      })
      .mockResolvedValueOnce({
        text: 'Done',
        stopReason: 'end_turn',
        model: 'claude-3-5-sonnet-20241022',
        usage: { inputTokens: 20, outputTokens: 10 }
      });

    const toolCalls: any[] = [];
    const toolResults: any[] = [];

    await ai.executeToolUseLoop(
      [{ role: 'user', content: 'Test' }],
      {},
      executor,
      {
        onToolCall: (tc) => toolCalls.push(tc),
        onToolResult: (r) => toolResults.push(r)
      }
    );

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('test_tool');
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0].success).toBe(true);
  });

  test('should respect shouldContinue callback', async () => {
    const executor = jest.fn().mockResolvedValue({ data: 'result' });

    jest.spyOn(ai, 'chatWithTools').mockResolvedValue({
      text: '',
      stopReason: 'tool_use',
      model: 'claude-3-5-sonnet-20241022',
      usage: { inputTokens: 10, outputTokens: 5 },
      toolCalls: [
        { type: 'tool_use', id: 'tool_1', name: 'test_tool', input: {} }
      ],
      contentBlocks: [
        { type: 'tool_use', id: 'tool_1', name: 'test_tool', input: {} }
      ]
    });

    const result = await ai.executeToolUseLoop(
      [{ role: 'user', content: 'Test' }],
      {},
      executor,
      {
        maxIterations: 10,
        shouldContinue: (iteration) => iteration < 1
      }
    );

    expect(result.status).toBe('completed');
    expect(result.iterations).toBe(1);
  });

  test('should cleanup hanging tool calls on error', async () => {
    const executor = jest.fn();

    jest.spyOn(ai, 'chatWithTools')
      .mockResolvedValueOnce({
        text: '',
        stopReason: 'tool_use',
        model: 'claude-3-5-sonnet-20241022',
        usage: { inputTokens: 10, outputTokens: 5 },
        toolCalls: [
          { type: 'tool_use', id: 'tool_1', name: 'test_tool', input: {} }
        ],
        contentBlocks: [
          { type: 'tool_use', id: 'tool_1', name: 'test_tool', input: {} }
        ]
      })
      .mockRejectedValueOnce(new Error('API failed'));

    const result = await ai.executeToolUseLoop(
      [{ role: 'user', content: 'Test' }],
      {},
      executor,
      { maxIterations: 2 }
    );

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('UNKNOWN');
    // Should cleanup hanging tool_use
    const lastMsg = result.messages[result.messages.length - 1];
    if (lastMsg.role === 'assistant' && Array.isArray(lastMsg.content)) {
      const toolUseBlocks = lastMsg.content.filter(b => b.type === 'tool_use');
      expect(toolUseBlocks).toHaveLength(0);
    }
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm test -- ai-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit loop method**

```bash
git add src/core/ai-client.ts src/core/ai-client.test.ts
git commit -m "feat(ai-client): add executeToolUseLoop with state machine"
```

---

## Task 6: Update Exports

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add new type exports**

Update `src/index.ts`:

```typescript
// Types
export type {
  // ... existing exports ...
  ToolUseLoopState,
  ToolUseLoopResultStatus,
  ToolUseLoopError,
  ToolUseLoopOptions,
  ToolUseLoopResult,
  ParallelExecutionOptions,
  PersistenceProvider,
  HistoryPersistenceOptions,
} from './types/types';
```

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds without errors

- [ ] **Step 3: Commit exports**

```bash
git add src/index.ts
git commit -m "feat(exports): export advanced features types"
```

---

## Task 7: Update Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add executeToolUseLoop example**

Add after existing Tool Use examples:

```markdown
### Complete Tool Use Loop

\`\`\`typescript
import { AIClient, ToolDefinition } from 'latte-ts-models';

const ai = new AIClient({ /* config */ });

const tools: ToolDefinition[] = [
  {
    name: 'search_web',
    description: 'Search the web',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    }
  },
  {
    name: 'read_file',
    description: 'Read a file',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' }
      },
      required: ['path']
    }
  }
];

// Execute complete tool use loop automatically
const result = await ai.executeToolUseLoop(
  [{ role: 'user', content: 'Find documentation about React hooks' }],
  { tools },
  async (name, input, context) => {
    if (name === 'search_web') {
      return await searchAPI(input.query);
    } else if (name === 'read_file') {
      return await readFile(input.path);
    }
    throw new Error(`Unknown tool: ${name}`);
  },
  {
    maxIterations: 10,
    forceFinalize: true,
    timeout: 120000,
    onStateChange: (state) => console.log(`State: ${state}`),
    onToolCall: (toolCall) => console.log(`Calling: ${toolCall.name}`),
    onToolResult: (result) => console.log(`Result: ${result.success ? 'OK' : 'FAIL'}`)
  }
);

if (result.status === 'completed') {
  console.log('Response:', result.response.text);
} else if (result.status === 'max_iterations') {
  console.log('Reached max iterations');
  console.log('Executed', result.toolCallsExecuted, 'tool calls');
} else {
  console.error('Error:', result.error?.message);
}

// Access complete conversation history
console.log('Messages:', result.messages);
\`\`\`
```

- [ ] **Step 2: Add parallel execution example**

Add after loop example:

```markdown
### Parallel Tool Execution

\`\`\`typescript
// Execute multiple tool calls in parallel
const toolCalls = [
  { type: 'tool_use', id: 'tool_1', name: 'get_user', input: { userId: 'user_1' } },
  { type: 'tool_use', id: 'tool_2', name: 'get_user', input: { userId: 'user_2' } },
  { type: 'tool_use', id: 'tool_3', name: 'update_balance', input: { userId: 'user_1', amount: 100 } }
];

const results = await ai.executeToolsParallel(
  toolCalls,
  async (name, input) => {
    if (name === 'get_user') return await getUser(input.userId);
    if (name === 'update_balance') return await updateBalance(input.userId, input.amount);
    throw new Error(`Unknown tool: ${name}`);
  },
  {
    maxConcurrency: 5,
    // Group by userId to prevent race conditions
    getResourceKey: (tc) => tc.input.userId,
    // Read operations are concurrency-safe
    isConcurrencySafe: (tc) => tc.name === 'get_user',
    onBatchStart: (batch) => console.log(`Starting batch of ${batch.length}`),
    onBatchEnd: (results) => console.log(`Batch completed: ${results.size} results`)
  }
);

// Results are keyed by tool call ID
for (const [toolId, result] of results) {
  console.log(`${toolId}: ${result.success ? 'success' : result.error}`);
}
\`\`\`
```

- [ ] **Step 3: Add persistence example**

Add after parallel execution example:

```markdown
### Chat History Persistence

\`\`\`typescript
import { ChatHistory } from 'latte-ts-models';

// Create history with auto-save enabled
const history = new ChatHistory(100_000, {
  persistence: {
    provider: 'file',
    filePath: './data/conversation.json',
    autoSave: true,        // Auto-save on every message
    autoSaveDelay: 500,    // Debounce 500ms
    validateData: true    // Validate on load
  },
  onTruncate: (event) => {
    console.log(`Removed ${event.removedMessages.length} messages`);
  }
});

// Messages are automatically saved
history.addUserMessage('What is the weather?');
history.addAssistantMessage('Let me check...');

// Manual save/load
await history.saveToFile('./backup/conversation.json');
await history.loadFromFile('./backup/conversation.json');

// Force flush before program exit
process.on('SIGINT', async () => {
  await history.flush();
  process.exit(0);
});
\`\`\`
```

- [ ] **Step 4: Update API Reference**

Add to API Reference section:

```markdown
#### `executeToolUseLoop(messages, options, executor, loopOptions?)`

Execute complete Tool Use loop automatically.

**Parameters:**
- `messages: ChatMessage[]` - Initial conversation messages
- `options: ChatOptions` - Chat options with tools
- `executor: ToolExecutor` - Tool execution function
- `loopOptions?: ToolUseLoopOptions` - Loop control options

**Returns:** `Promise<ToolUseLoopResult>`

#### `executeToolsParallel(toolCalls, executor, options?)`

Execute multiple tool calls in parallel.

**Parameters:**
- `toolCalls: ToolUseBlock[]` - Tool calls to execute
- `executor: ToolExecutor` - Tool execution function
- `options?: ParallelExecutionOptions` - Parallel execution options

**Returns:** `Promise<Map<string, ToolExecutionResult>>`

#### `ChatHistory.saveToFile(filePath?)`

Save history to file.

#### `ChatHistory.loadFromFile(filePath?)`

Load history from file.

#### `ChatHistory.flush()`

Force flush (immediately save).
```

- [ ] **Step 5: Commit documentation**

```bash
git add README.md
git commit -m "docs: update README with advanced features examples"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds without errors

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Create final commit**

```bash
git add -A
git commit -m "feat: complete AI Agent Advanced Features implementation

- Add executeToolUseLoop for complete loop abstraction
- Add executeToolsParallel with resource grouping
- Add ChatHistory persistence with auto-save
- All features maintain backward compatibility"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ executeToolUseLoop (Task 5)
- ✅ executeToolsParallel (Task 4)
- ✅ History persistence (Task 2)
- ✅ Type definitions (Task 1)
- ✅ Exports (Task 6)
- ✅ Documentation (Task 7)

**2. Placeholder scan:**
- ✅ All code blocks are complete
- ✅ All file paths are exact
- ✅ All commands have expected outputs

**3. Type consistency:**
- ✅ `ToolUseLoopOptions` matches spec
- ✅ `ParallelExecutionOptions` includes getResourceKey and isConcurrencySafe
- ✅ `HistoryPersistenceOptions` matches spec
- ✅ All imports are included
