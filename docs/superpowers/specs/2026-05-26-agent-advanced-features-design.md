# AI Agent Advanced Features Design

**Date:** 2026-05-26
**Status:** Approved
**Author:** Claude + User Collaboration

---

## Executive Summary

This document outlines the design for three advanced enhancements to the latte-ts-models library to further improve AI Agent development experience. These features build upon the Agent Enhancement implementation (2026-05-25) and address higher-level abstraction needs.

### Priority Order

1. **Complete Tool Use Loop** (Highest) - High-level abstraction for full AI-Tool-AI cycle
2. **Parallel Tool Execution** (Medium) - Performance optimization via concurrent execution
3. **History Persistence** (Medium) - Data durability for conversation history

---

## 1. Problem Analysis

### 1.1 Current Limitations

After implementing ChatHistory, event callbacks, and tool retry (2026-05-25), Agent developers still face challenges:

1. **No Loop Abstraction** - Developers must manually write loop logic for full Tool Use cycles
   - Manual handling of: AI call → tool execution → result return → continue conversation
   - No automatic handling of max iterations, timeouts, or graceful degradation
   - Risk of infinite loops or incomplete execution

2. **Sequential Tool Execution** - Multiple tool calls execute sequentially
   - Independent tools could run in parallel for efficiency
   - Resource conflicts require careful handling
   - No concurrency control mechanism

3. **No History Persistence** - ChatHistory only exists in memory
   - Conversation history lost on restart
   - No automatic save mechanism
   - Manual save/load burden on developers

---

## 2. Architecture

### 2.1 File Structure

**Modified Files:**
```
src/
├── types/
│   └── types.ts                  # New type definitions
├── core/
│   └── ai-client.ts              # Add executeToolUseLoop, executeToolsParallel
│   └── chat-history.ts           # Add persistence methods
└── index.ts                      # Export new types
```

**No New Files** - All logic integrated into existing classes for encapsulation.

### 2.2 Design Principles

1. **Encapsulation** - Methods belong to their respective classes (AIClient, ChatHistory)
2. **Backward Compatibility** - All new parameters are optional
3. **Composition** - Build on existing methods (chatWithTools, executeToolWithRetry)
4. **State Machine** - Explicit state management for complex loops
5. **Error Isolation** - Individual failures don't break overall flow

---

## 3. Feature 1: Complete Tool Use Loop

### 3.1 Overview

The `executeToolUseLoop` method provides a high-level abstraction that automatically handles the complete "AI thinking → tool calling → result processing → continue conversation" cycle.

**Key Responsibilities:**
- Automatic loop management with iteration limits
- State machine for clear execution phases
- Graceful degradation on max iterations
- Timeout control for overall execution
- Callbacks for UI updates and monitoring

### 3.2 Type Definitions

```typescript
/**
 * Tool Use loop state (fine-grained)
 */
export type ToolUseLoopState =
  | 'idle'              // Initial state
  | 'thinking'          // Model processing
  | 'executing_tools'   // Tools being executed
  | 'processing_results' // Results being prepared for model
  | 'finalizing'        // Forced finalization (no tools)
  | 'completed'         // Normal completion
  | 'failed';           // Error state

/**
 * Tool Use loop result status
 */
export type ToolUseLoopResultStatus =
  | 'completed'         // Normal completion
  | 'max_iterations'    // Reached max iterations
  | 'error';            // Error occurred

/**
 * Structured error information
 */
export interface ToolUseLoopError {
  code: 'TIMEOUT' | 'MAX_ITERATIONS' | 'TOOL_EXECUTION_FAILED' | 'UNKNOWN';
  message: string;
  originalError?: Error;
}

/**
 * Tool Use loop options
 */
export interface ToolUseLoopOptions {
  maxIterations?: number;                              // Max iterations (default: 10)
  forceFinalize?: boolean;                             // Force finalize on limit (default: true)
  timeout?: number;                                    // Global timeout in ms (default: 120000)
  onStateChange?: (state: ToolUseLoopState) => void;   // State change callback
  onToolCall?: (toolCall: ToolUseBlock) => void;       // Tool call callback
  onToolResult?: (result: ToolExecutionResult) => void; // Tool result callback
  shouldContinue?: (iteration: number, response: ChatResponseWithTools) => boolean;
}

/**
 * Tool Use loop result
 */
export interface ToolUseLoopResult {
  status: ToolUseLoopResultStatus;
  response: ChatResponse;
  messages: ChatMessage[];             // Complete conversation history
  iterations: number;
  toolCallsExecuted: number;
  state: ToolUseLoopState;
  error?: ToolUseLoopError;
}
```

### 3.3 Method Signature

```typescript
async executeToolUseLoop(
  messages: ChatMessage[],
  options: ChatOptions,
  executor: ToolExecutor,
  loopOptions?: ToolUseLoopOptions,
  logger?: Logger
): Promise<ToolUseLoopResult>
```

### 3.4 Core Logic Flow

```
START → state: thinking
  ↓
Call chatWithTools(messages, options)
  ↓
Has tool calls? → No → state: completed → Return result
  ↓ Yes
shouldContinue? → No → Cleanup hanging → state: completed → Return result
  ↓ Yes
Timeout? → Yes → Cleanup hanging → state: failed → Return partial result
  ↓ No
Max iterations? → Yes → forceFinalize? → Yes → state: finalizing → Final call (no tools)
  ↓ No                          ↓ No                ↓
  state: executing_tools        state: failed       Cleanup hanging → Return partial result
  ↓
Execute all tools (with retry)
  ↓
state: processing_results
  ↓
Build tool result messages, add to history
  ↓
iteration++, loop back to START
```

### 3.5 Error Handling Strategy

| Scenario | Handling | Error Code | Cleanup Hanging |
|----------|----------|------------|-----------------|
| Max iterations | Force finalize → return partial result on failure | `MAX_ITERATIONS` | Yes (if finalize fails) |
| Global timeout | Return partial result + messages | `TIMEOUT` | Yes |
| Tool execution failed | Inject error context, continue iteration | `TOOL_EXECUTION_FAILED` | No (context injected) |
| shouldContinue returns false | Return current result + messages | None (normal) | Yes |
| Other exceptions | Return error + existing messages | `UNKNOWN` | Yes |

### 3.6 Hanging Tool Calls Cleanup

```typescript
/**
 * Clean up dangling tool_use blocks (no corresponding tool_result)
 * AND orphaned tool_result blocks (no corresponding tool_use)
 */
private cleanupHangingToolCalls(messages: ChatMessage[]): ChatMessage[] {
  const cleaned = [...messages];

  // Step 1: Find all tool_use IDs
  const toolUseIds = new Set<string>();
  for (const msg of cleaned) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_use') {
          toolUseIds.add(block.id);
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
          toolResultIds.add(block.tool_use_id);
        }
      }
    }
  }

  // Step 3: Remove dangling tool_use blocks
  for (let i = 0; i < cleaned.length; i++) {
    const msg = cleaned[i];
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const blocks = msg.content as ContentBlock[];
      const cleanedBlocks = blocks.filter(block => {
        if (block.type === 'tool_use') {
          return toolResultIds.has(block.id);
        }
        return true;
      });
      if (cleanedBlocks.length !== blocks.length) {
        cleaned[i] = { ...msg, content: cleanedBlocks };
      }
    }
  }

  // Step 4: Remove orphaned tool_result blocks
  for (let i = 0; i < cleaned.length; i++) {
    const msg = cleaned[i];
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const blocks = msg.content as ContentBlock[];
      const cleanedBlocks = blocks.filter(block => {
        if (block.type === 'tool_result') {
          return toolUseIds.has(block.tool_use_id);
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

### 3.7 Tool Execution Failure Context Injection

```typescript
// When tool execution fails, still append message for model awareness
const errorMessage = result.success
  ? result.result
  : `工具执行失败，错误原因：${result.error}，请尝试其他方法或告知用户`;

const toolResultMessage = AIClient.buildToolResultMessage(
  toolCall.id,
  errorMessage,
  !result.success
);
```

### 3.8 Force Finalize Implementation

```typescript
// On last iteration with forceFinalize enabled
if (isLastIteration && forceFinalize) {
  // Remove tools parameter to force text-only response
  const finalizeOptions = { ...options, tools: undefined };

  try {
    stateMachine.setState('finalizing');
    const finalResponse = await this.chat(currentMessages, finalizeOptions, logger);

    return {
      status: 'completed',
      response: finalResponse,
      messages: currentMessages,
      iterations: iteration + 1,
      toolCallsExecuted,
      state: 'completed'
    };
  } catch (error) {
    // Finalize failed, cleanup and return partial result
    const cleanedMessages = this.cleanupHangingToolCalls(currentMessages);
    return {
      status: 'max_iterations',
      response: { text: '', stopReason: 'max_tokens', model: '', usage: undefined },
      messages: cleanedMessages,
      iterations: iteration + 1,
      toolCallsExecuted,
      state: 'failed',
      error: {
        code: 'MAX_ITERATIONS',
        message: 'Force finalize failed',
        originalError: error instanceof Error ? error : new Error(String(error))
      }
    };
  }
}
```

### 3.9 Usage Example

```typescript
const ai = new AIClient({ /* config */ });

const result = await ai.executeToolUseLoop(
  [{ role: 'user', content: 'Find restaurants near me and book a table' }],
  { tools, systemPrompt: 'You are a helpful assistant' },
  async (name, input, context) => {
    if (name === 'search_restaurants') {
      return await searchAPI(input.location);
    } else if (name === 'book_table') {
      return await bookingAPI(input.restaurantId, input.time);
    }
    throw new Error(`Unknown tool: ${name}`);
  },
  {
    maxIterations: 10,
    forceFinalize: true,
    timeout: 120000,
    onStateChange: (state) => console.log(`State: ${state}`),
    onToolCall: (toolCall) => console.log(`Calling: ${toolCall.name}`),
    onToolResult: (result) => console.log(`Result: ${result.success ? 'success' : 'failed'}`),
    shouldContinue: (iteration, response) => iteration < 8
  }
);

if (result.status === 'completed') {
  console.log(result.response.text);
} else if (result.status === 'max_iterations') {
  console.log('Reached max iterations, partial results:', result.messages);
  console.log('Executed', result.toolCallsExecuted, 'tool calls');
} else {
  console.error('Error:', result.error?.message);
}
```

---

## 4. Feature 2: Parallel Tool Execution

### 4.1 Overview

The `executeToolsParallel` method enables concurrent execution of independent tool calls while providing resource isolation for conflicting operations.

**Key Responsibilities:**
- Resource-based grouping for conflict prevention
- Concurrency-safe tool identification
- Exception isolation (single failure doesn't break batch)
- Result ordering aligned with original call sequence

### 4.2 Type Definitions

```typescript
/**
 * Parallel execution options
 */
export interface ParallelExecutionOptions {
  maxConcurrency?: number;                               // Max parallel count (default: 5)
  getResourceKey?: (toolCall: ToolUseBlock) => string | null; // Resource grouping key
  isConcurrencySafe?: (toolCall: ToolUseBlock) => boolean; // Concurrency-safe check
  logger?: Logger;
  onRetry?: (event: RetryEvent) => void;
  onBatchStart?: (batch: ToolUseBlock[]) => void;
  onBatchEnd?: (results: Map<string, ToolExecutionResult>) => void;
}
```

### 4.3 Method Signature

```typescript
async executeToolsParallel(
  toolCalls: ToolUseBlock[],
  executor: ToolExecutor,
  options?: ParallelExecutionOptions,
  logger?: Logger
): Promise<Map<string, ToolExecutionResult>>
```

### 4.4 Core Logic Flow

```
START
  ↓
has getResourceKey? ──Yes──→ Extract resource keys for each tool call
  ↓ No                         ↓
has isConcurrencySafe? ──Yes→ Separate safe vs unsafe tools
  ↓ No                         ↓
Group by resource key      Safe tools → global parallel pool
  ↓                         Unsafe tools → resource queues
Build execution batches (maxConcurrency per batch)
  ↓
Execute batch:
  ├─ Safe tools → parallel
  ├─ Same resource group → sequential
  └─ Different resource groups → parallel
  ↓
Wrap each executor call in try-catch
  ↓
Collect results in Map by toolCall.id
  ↓
Trigger onBatchEnd callback
  ↓
Return results Map
```

### 4.5 Resource Grouping Logic

```typescript
// Step 1: Separate concurrency-safe tools
const safeTools: ToolUseBlock[] = [];
const resourceQueues = new Map<string | null, ToolUseBlock[]>();

for (const toolCall of toolCalls) {
  // Check if tool is concurrency-safe
  if (options?.isConcurrencySafe?.(toolCall)) {
    safeTools.push(toolCall);
    continue;
  }

  // Extract resource key
  const key = options?.getResourceKey?.(toolCall) ?? null;

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
for (let i = 0; i < queueArrays.length; i += maxConcurrency) {
  const batch = queueArrays.slice(i, i + maxConcurrency);
  // Interleave: take one from each queue per parallel slot
  const maxLen = Math.max(...batch.map(q => q.length));
  for (let j = 0; j < maxLen; j++) {
    const parallelGroup: ToolUseBlock[] = [];
    for (const queue of batch) {
      if (queue[j]) {
        parallelGroup.push(queue[j]);
      }
    }
    if (parallelGroup.length > 0) {
      batches.push(parallelGroup);
    }
  }
}
```

### 4.6 Exception Isolation

```typescript
// Each tool execution wrapped in try-catch
const batchPromises = batch.map(async (toolCall) => {
  try {
    const result = await this.executeToolWithRetry(
      toolCall,
      executor,
      3,
      { logger, onRetry }
    );
    results.set(toolCall.id, result);
    return { toolCall, result };
  } catch (error) {
    // Don't let single failure break the batch
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
```

### 4.7 Usage Example

```typescript
const result = await ai.executeToolsParallel(
  toolCalls,
  async (name, input, context) => {
    if (name === 'get_user') {
      return await fetchUser(input.userId);
    } else if (name === 'update_balance') {
      return await updateBalance(input.userId, input.amount);
    }
    throw new Error(`Unknown tool: ${name}`);
  },
  {
    maxConcurrency: 5,
    // Group by userId to prevent race conditions
    getResourceKey: (toolCall) => {
      if (toolCall.name === 'update_balance') {
        return toolCall.input.userId;
      }
      return null; // Other tools have no resource conflicts
    },
    // Read-only operations are concurrency-safe
    isConcurrencySafe: (toolCall) => {
      return toolCall.name === 'get_user';
    },
    onBatchStart: (batch) => console.log(`Starting batch of ${batch.length}`),
    onBatchEnd: (results) => console.log(`Batch complete: ${results.size} results`)
  }
);

// Results are keyed by toolCall.id
for (const [toolId, result] of result) {
  if (result.success) {
    console.log(`${toolId}: ${JSON.stringify(result.result)}`);
  } else {
    console.error(`${toolId} failed: ${result.error}`);
  }
}
```

---

## 5. Feature 3: History Persistence

### 5.1 Overview

Extend `ChatHistory` class with automatic persistence capabilities, supporting file-based storage with debounce for performance.

**Key Responsibilities:**
- Automatic save on message addition (configurable)
- Debounced writes to minimize I/O
- Data integrity validation on load
- Lightweight file locking for concurrent safety
- Provider abstraction for future extension

### 5.2 Type Definitions

```typescript
/**
 * Persistence provider type (extensible)
 */
export type PersistenceProvider = 'file' | 'sqlite' | 'indexeddb';

/**
 * History persistence options
 */
export interface HistoryPersistenceOptions {
  provider?: PersistenceProvider;        // Storage provider (default: 'file')
  filePath?: string;                     // File path (required when provider='file')
  autoSave?: boolean;                    // Auto save (default: false)
  autoSaveDelay?: number;               // Auto save delay in ms (default: 1000)
  debounce?: boolean;                   // Use debounce (default: true)
  validateData?: boolean;                // Validate data integrity (default: true)
}
```

### 5.3 Constructor Extension

```typescript
constructor(
  maxTokens: number = 100_000,
  options?: {
    tokenizer?: Tokenizer;
    onTruncate?: (event: TruncateEvent) => void;
    persistence?: HistoryPersistenceOptions;  // NEW
  }
)
```

### 5.4 New Methods

```typescript
/**
 * Save history to file
 */
async saveToFile(filePath?: string): Promise<void>

/**
 * Load history from file
 */
async loadFromFile(filePath?: string): Promise<void>

/**
 * Force flush (clear debounce timer, write immediately)
 */
async flush(): Promise<void>
```

### 5.5 Auto-save Mechanism

```typescript
private saveDebounceTimer?: NodeJS.Timeout;
private writeLock: boolean = false;

private triggerAutoSave(): void {
  if (!this.persistence?.autoSave || !this.persistence?.filePath) {
    return;
  }

  // Clear existing timer
  if (this.saveDebounceTimer) {
    clearTimeout(this.saveDebounceTimer);
  }

  // Debounce: delay write by autoSaveDelay
  this.saveDebounceTimer = setTimeout(async () => {
    await this.flush();
  }, this.persistence.autoSaveDelay ?? 1000);
}

async flush(): Promise<void> {
  // Clear debounce timer
  if (this.saveDebounceTimer) {
    clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = undefined;
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

### 5.6 Data Integrity Validation

```typescript
async loadFromFile(filePath?: string): Promise<void> {
  const targetPath = filePath || this.persistence?.filePath;
  if (!targetPath) {
    throw new Error('Storage path is not defined');
  }

  try {
    if (!(await fs.pathExists(targetPath))) {
      return; // File doesn't exist, use empty history
    }

    const data = await fs.readJson(targetPath);

    // Validate data structure
    if (this.persistence?.validateData !== false) {
      if (!Array.isArray(data?.messages)) {
        console.warn('Invalid history file format: messages is not an array, using empty history');
        return;
      }

      // Validate each message
      for (const msg of data.messages) {
        if (msg.role !== 'user' && msg.role !== 'assistant') {
          console.warn('Invalid message role in history file, using empty history');
          return;
        }
      }
    }

    this.messages = data.messages || [];

    // Enforce limit after loading
    this.enforceLimit();
  } catch (error) {
    console.warn('Failed to load history file, using empty history:', error);
    this.messages = [];
  }
}
```

### 5.7 File Storage Format

```json
{
  "version": "1.0",
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi there!" }
  ],
  "timestamp": "2026-05-26T10:30:00.000Z",
  "totalTokens": 42,
  "metadata": {
    "provider": "file",
    "maxTokens": 100000
  }
}
```

### 5.8 Usage Example

```typescript
// Create history with auto-save enabled
const history = new ChatHistory(100_000, {
  persistence: {
    provider: 'file',
    filePath: './data/conversation.json',
    autoSave: true,
    autoSaveDelay: 500,
    validateData: true
  },
  onTruncate: (event) => {
    console.log(`Removed ${event.removedMessages.length} messages`);
  }
});

// Messages are automatically saved (debounced)
history.addUserMessage('Hello');
history.addAssistantMessage('Hi there!');

// Manual save/load
await history.saveToFile('./backup/conversation.json');
await history.loadFromFile('./backup/conversation.json');

// Force flush before program exit
process.on('SIGINT', async () => {
  await history.flush();
  process.exit(0);
});
```

---

## 6. Integration with ChatHistory

All existing methods (`addUserMessage`, `addAssistantMessage`, etc.) will be updated to trigger auto-save:

```typescript
addUserMessage(content: string): void {
  this.messages.push({ role: 'user', content });
  this.enforceLimit();
  this.triggerAutoSave();  // NEW
}

addAssistantMessage(text: string): void {
  this.messages.push({ role: 'assistant', content: text });
  this.enforceLimit();
  this.triggerAutoSave();  // NEW
}

addToolResult(toolUseId: string, result: any, isError: boolean = false): void {
  // ... existing logic ...
  this.triggerAutoSave();  // NEW
}

clear(): void {
  this.messages = [];
  this.triggerAutoSave();  // NEW
}
```

---

## 7. Performance Considerations

### 7.1 Tool Use Loop

- **State transitions**: O(1) per transition
- **Cleanup logic**: O(n) where n = message count (rarely triggered)
- **Memory**: Minimal overhead, reuses existing messages array

### 7.2 Parallel Execution

- **Grouping**: O(m) where m = tool call count
- **Batch execution**: Parallel up to maxConcurrency
- **Resource isolation**: Same-resource operations serialized automatically

### 7.3 History Persistence

- **Debounce**: Default 1000ms delay prevents excessive I/O
- **Write lock**: Prevents concurrent file access
- **Validation**: O(n) on load where n = message count

---

## 8. Security Considerations

### 8.1 Tool Use Loop

- **Timeout**: Global timeout prevents runaway loops
- **Resource exhaustion**: maxIterations caps total operations
- **Error isolation**: Single tool failure doesn't crash loop

### 8.2 Parallel Execution

- **Resource conflicts**: Explicit grouping prevents race conditions
- **API rate limits**: maxConcurrency prevents overwhelming external services
- **Exception isolation**: Single failure doesn't break batch

### 8.3 History Persistence

- **File permissions**: Uses standard fs operations, respects system permissions
- **Data validation**: Invalid data rejected on load
- **Write lock**: Prevents file corruption from concurrent writes

---

## 9. Backward Compatibility

All changes maintain backward compatibility:

| Change | Compatibility |
|--------|---------------|
| `executeToolUseLoop()` | New method, no impact |
| `executeToolsParallel()` | New method, no impact |
| ChatHistory persistence | Optional via constructor options |
| Type additions | Additive only, no breaking changes |

---

## 10. Future Enhancements

Potential improvements for future versions:

1. **Streaming loop support** - Integrate with chatStream callbacks
2. **SQLite provider** - For more robust persistence
3. **IndexedDB provider** - For browser-side storage
4. **Loop checkpointing** - Save/restore loop state mid-execution
5. **Tool dependency graphs** - Automatic parallelization based on dependencies

---

## 11. References

- [Anthropic Tool Use Documentation](https://docs.anthropic.com/claude/docs/tool-use)
- [State Machine Patterns](https://refactoring.guru/design-patterns/state)
- [fs-extra Documentation](https://github.com/jprichardson/node-fs-extra)
- [Concurrency Control Patterns](https://martinfowler.com/articles/patterns-of-distributed-systems/single-threaded-execution.html)
