# AI Agent Enhancement Design

**Date:** 2026-05-25
**Status:** Approved
**Author:** Claude + User Collaboration

---

## Executive Summary

This document outlines the design for four enhancements to the latte-ts-models library to better support AI Agent development. These features address critical pain points in Agent systems: context window management, real-time UI updates, tool execution reliability, and developer convenience.

### Priority Order

Based on impact on Agent framework core capabilities and development effort:

1. **B) ChatHistory Class** (Highest) - Foundation for Agent memory management
2. **A) Event Callback Mechanism** - Critical for real-time UI experience
3. **D) Tool Execution Retry** - Improves Agent robustness
4. **C) Tool Result Formatting** - Developer convenience

---

## 1. Problem Analysis

### 1.1 Current Limitations

The Tool Use and Streaming implementation provides core functionality, but Agent developers face several challenges:

1. **No History Management** - Agents must manually manage `ChatMessage[]` arrays
   - No Token counting or context window management
   - Long conversations exceed context limits and crash
   - No automatic truncation strategy

2. **No Real-time Callbacks** - `chatStream()` returns final result only
   - Cannot update UI during streaming (typewriter effect)
   - No visibility into tool execution progress
   - Poor user experience for real-time applications

3. **No Tool Retry Logic** - Tool execution failures are common
   - Network errors, API rate limits, timeouts
   - No automatic retry with exponential backoff
   - Agents must implement retry logic themselves

4. **Manual Result Formatting** - Developers must format tool results manually
   - Complex objects need JSON serialization
   - Error stacks can be very long
   - No automatic Markdown formatting for LLM readability

---

## 2. Architecture

### 2.1 File Structure

**New Files:**
```
src/
├── core/
│   └── chat-history.ts           # ChatHistory class
└── utils/
    └── tool-result-formatter.ts  # formatToolResult function
```

**Modified Files:**
```
src/
├── types/
│   └── types.ts                  # New type definitions
├── core/
│   └── ai-client.ts              # New methods + chatStream enhancement
└── index.ts                      # Export new types and classes
```

---

## 3. Feature 1: ChatHistory Class

### 3.1 Overview

The `ChatHistory` class manages conversation history with automatic Token counting and truncation.

**Key Responsibilities:**
- Token estimation and counting
- Automatic truncation when exceeding limits
- Convenient message addition methods
- Truncation hook for advanced handling

### 3.2 Class Design

```typescript
/**
 * Tokenizer interface for custom Token counting
 */
export interface Tokenizer {
  estimateTokens(text: string): number;
}

/**
 * Truncation event for the onTruncate hook
 */
export interface TruncateEvent {
  removedMessages: ChatMessage[];  // Messages that were removed
  remainingTokens: number;          // Token count after truncation
}

/**
 * Conversation history manager
 */
export class ChatHistory {
  private messages: ChatMessage[] = [];
  private maxTokens: number;
  private tokenizer?: Tokenizer;
  private onTruncate?: (event: TruncateEvent) => void;

  // Token estimation constants
  private readonly TOKENS_PER_WORD = 4;
  private readonly MESSAGE_OVERHEAD = 10;

  constructor(
    maxTokens: number = 100_000,
    options?: {
      tokenizer?: Tokenizer;
      onTruncate?: (event: TruncateEvent) => void;
    }
  );

  // Token estimation
  estimateTokens(message: ChatMessage): number;
  getTotalTokens(): number;

  // Message addition
  addUserMessage(content: string): void;
  addAssistantMessage(text: string): void;
  addAssistantMessageWithTools(text: string, toolCalls: ToolUseBlock[]): void;
  addToolResult(toolUseId: string, result: any, isError?: boolean): void;

  // Query and management
  getMessages(): readonly ChatMessage[];
  clear(): void;
  getMessageCount(): number;
}
```

### 3.3 Token Estimation Strategy

**Default estimation (no tokenizer provided):**
- Message overhead: 10 tokens per message
- English text: words × 4 tokens
- Chinese text: characters × 1.5 tokens
- Mixed text: hybrid calculation

**With custom tokenizer:**
- Users can inject a precise tokenizer (e.g., Tiktoken, @anthropic/tokenizer)
- Falls back to estimation if not provided

### 3.4 Truncation Strategy

**FIFO (First In, First Out):**
1. When `getTotalTokens() > maxTokens`
2. Remove oldest messages first
3. Keep at least one message
4. Trigger `onTruncate` hook with removed messages

**Hook usage examples:**
- Store removed messages in vector database for later retrieval
- Summarize removed messages and re-insert as a summary
- Log truncation events for debugging

### 3.5 Usage Example

```typescript
// Create history with 100K token limit
const history = new ChatHistory(100_000, {
  onTruncate: (event) => {
    console.log(`Removed ${event.removedMessages.length} messages`);
    // Optionally: store in vector DB, summarize, etc.
  }
});

// Add messages
history.addUserMessage('What\'s the weather in Beijing?');

let response = await ai.chatWithTools(history.getMessages(), { tools });

// Add assistant response with tool calls
history.addAssistantMessageWithTools(response.text, response.toolCalls || []);

// Add tool results
for (const toolCall of response.toolCalls || []) {
  const result = await executeTool(toolCall);
  history.addToolResult(toolCall.id, result);
}
```

---

## 4. Feature 2: Event Callback Mechanism

### 4.1 Overview

Add real-time callbacks to `chatStream()` for UI updates during streaming.

**Key Design Decisions:**
- Every delta triggers callback immediately (no throttling)
- Callback is optional (backward compatible)
- Exception isolation prevents callback errors from breaking stream

### 4.2 Type Definitions

```typescript
/**
 * Stream event callback function type
 */
export type StreamEventCallback = (event: StreamEvent) => void;

/**
 * Stream event (extended with lifecycle events)
 */
export interface StreamEvent {
  type:
    | 'stream_start'      // Stream started
    | 'text'              // Text delta
    | 'tool_use_start'    // Tool call started
    | 'tool_use_input'    // Tool input delta
    | 'tool_use_end'      // Tool call completed
    | 'stream_end'        // Stream completed successfully
    | 'stream_error';     // Stream encountered error

  // Text related
  delta?: string;

  // Tool related
  toolName?: string;
  toolId?: string;
  partialInput?: any;

  // Error related
  error?: Error;

  // Metadata
  model?: string;
  usage?: Usage;
}
```

### 4.3 Method Signature

```typescript
async chatStream(
  messages: ChatMessage[],
  options?: ChatOptions,
  onEvent?: StreamEventCallback,  // NEW: Optional callback
  logger?: Logger
): Promise<ChatResponseWithTools>
```

### 4.4 Event Lifecycle

```
stream_start → [text | tool_use_start → tool_use_input* → tool_use_end]* → stream_end
                                                                     ↘ stream_error
```

### 4.5 Implementation Highlights

**Exception Isolation:**
```typescript
let hasEmittedError = false;

const safeTriggerEvent = (event: StreamEvent) => {
  if (hasEmittedError && event.type === 'stream_error') return;
  
  try {
    onEvent?.(event);
  } catch (error) {
    logger?.error('Stream event callback error', { error, event });
  }
};
```

**Prevent Duplicate Errors:**
- State flag `hasEmittedError` prevents multiple `stream_error` events
- Handles both manual abort and network failure scenarios

**Precise stream_start Timing:**
- Triggered on first event from SDK
- Includes actual model name (not alias)

### 4.6 Usage Example

```typescript
const response = await ai.chatStream(
  history.getMessages(),
  { tools },
  (event) => {
    switch (event.type) {
      case 'stream_start':
        console.log(`Using model: ${event.model}`);
        break;
      case 'text':
        process.stdout.write(event.delta);  // Typewriter effect
        break;
      case 'tool_use_start':
        console.log(`\n[Calling: ${event.toolName}]`);
        break;
      case 'tool_use_end':
        console.log(`\n[Tool ready: ${event.toolId}]`);
        break;
      case 'stream_end':
        console.log(`\nCompleted: ${event.usage?.outputTokens} tokens`);
        break;
      case 'stream_error':
        console.error(`Error: ${event.error?.message}`);
        break;
    }
  }
);
```

---

## 5. Feature 3: Tool Execution Retry

### 5.1 Overview

Add automatic retry with exponential backoff for tool execution.

**Key Design Decisions:**
- Library handles retry logic (not Agent)
- Reuses existing exponential backoff strategy
- Error classification distinguishes retryable vs non-retryable
- Optional retry callback for UI feedback

### 5.2 Type Definitions

```typescript
/**
 * Tool executor function with retry context
 */
export type ToolExecutor = (
  name: string,
  input: any,
  context: {
    attempt: number;      // Current attempt (1-indexed)
    maxRetries: number;   // Maximum attempts
    toolId: string;       // Tool call ID
  }
) => Promise<any>;

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  isSystemError?: boolean;  // true = system error (retryable)
                            // false = business logic error
}

/**
 * Retry event for onRetry callback
 */
export interface RetryEvent {
  toolName: string;
  toolId: string;
  attempt: number;
  maxRetries: number;
  delay: number;
  error: Error;
}
```

### 5.3 Method Signature

```typescript
async executeToolWithRetry(
  toolCall: ToolUseBlock,
  executor: ToolExecutor,
  maxRetries?: number,  // Default: 3
  options?: {
    logger?: Logger;
    onRetry?: (event: RetryEvent) => void;
  }
): Promise<ToolExecutionResult>
```

### 5.4 Retry Strategy

**Exponential Backoff:**
- Delay: `min(1000 * 2^(attempt-1), 10000)` milliseconds
- Example: 1000ms → 2000ms → 4000ms → ... (max 10s)

**Error Classification:**
- `NonRetryableError` → immediate failure, no retry
- Other errors → retry with backoff

**Error Types:**
| Error Type | Retry? | Example |
|------------|--------|---------|
| Network Error | Yes | Connection timeout |
| Rate Limit (429) | Yes | API quota exceeded |
| NonRetryableError | No | Invalid tool name |
| Business Error | No | "City not found" |

### 5.5 Usage Example

```typescript
// Define executor with context-aware behavior
async function executeTool(
  name: string,
  input: any,
  context: { attempt: number; maxRetries: number }
) {
  if (name === 'get_weather') {
    // Downgrade quality on retry
    const quality = context.attempt === 1 ? 'high' : 'low';
    return await fetchWeather(input.city, { quality });
  }
  throw new Error(`Unknown tool: ${name}`);
}

// Execute with retry
const result = await ai.executeToolWithRetry(
  toolCall,
  executeTool,
  3,  // Max 3 attempts
  {
    logger,
    onRetry: (event) => {
      console.log(`Retry ${event.attempt}/${event.maxRetries} in ${event.delay}ms`);
    }
  }
);

if (result.success) {
  history.addToolResult(toolCall.id, result.result);
} else {
  history.addToolResult(toolCall.id, result.error, true);
}
```

---

## 6. Feature 4: Tool Result Formatting

### 6.1 Overview

Add automatic formatting for tool results with Markdown enhancement and error stack truncation.

**Key Design Decisions:**
- Separate formatting function for testability
- Markdown code blocks for JSON (better LLM readability)
- Error stack truncation prevents context overflow
- Backward compatible (formatting options optional)

### 6.2 Type Definitions

```typescript
/**
 * Tool result formatting options
 */
export interface FormatOptions {
  maxErrorLines?: number;   // Max lines for error stacks (default: 10)
  jsonIndent?: number;      // JSON indentation spaces (default: 2)
  useMarkdown?: boolean;    // Wrap JSON in code blocks (default: true)
}
```

### 6.3 Formatting Function

```typescript
function formatToolResult(
  result: any,
  isError?: boolean,
  options?: FormatOptions
): string | ToolResultContent[]
```

**Formatting Rules:**
| Input Type | Normal Result | Error Result |
|------------|---------------|--------------|
| String | As-is | Truncate stack |
| Error object | N/A | Truncate stack |
| Object/Array | JSON → Markdown code block | Truncated JSON |
| Other | String(value) | Truncated string |

### 6.4 Enhanced buildToolResultMessage

```typescript
static buildToolResultMessage(
  toolUseId: string,
  result: any,
  isError?: boolean,
  formatOptions?: FormatOptions  // NEW: Optional formatting
): ChatMessage
```

### 6.5 Usage Example

```typescript
// Normal result: auto-convert to Markdown
const weatherData = { temp: 25, city: 'Beijing' };
const msg1 = AIClient.buildToolResultMessage('tool_1', weatherData);
// Content: "```json\n{\n  \"temp\": 25,\n  \"city\": \"Beijing\"\n}\n```"

// Error result: auto-truncate stack
const error = new Error('API failed\n  at line 1\n  at line 2\n...');
const msg2 = AIClient.buildToolResultMessage('tool_2', error, true, {
  maxErrorLines: 3
});
// Content: "Error: API failed\n  at line 1\n... (5 more lines)"

// Custom formatting
const msg3 = AIClient.buildToolResultMessage('tool_3', data, false, {
  useMarkdown: false,
  jsonIndent: 4
});
```

---

## 7. Implementation Plan

### 7.1 Task Breakdown

**Task 1: Type Definitions**
- Add `Tokenizer`, `TruncateEvent`, `StreamEventCallback`, `ToolExecutor`, `ToolExecutionResult`, `RetryEvent`, `FormatOptions`
- Update `StreamEvent` with new event types

**Task 2: ChatHistory Class**
- Create `src/core/chat-history.ts`
- Implement Token estimation
- Implement truncation with hook
- Add convenience methods

**Task 3: Event Callback Mechanism**
- Modify `chatStream()` method signature
- Add exception-isolated callback triggers
- Implement lifecycle events

**Task 4: Tool Execution Retry**
- Add `executeToolWithRetry()` method
- Implement exponential backoff
- Add error classification

**Task 5: Tool Result Formatting**
- Create `src/utils/tool-result-formatter.ts`
- Enhance `buildToolResultMessage()`

**Task 6: Exports**
- Export new types, classes, and functions

**Task 7: Tests**
- Unit tests for ChatHistory
- Unit tests for formatToolResult
- Integration tests for chatStream callbacks
- Integration tests for executeToolWithRetry

**Task 8: Documentation**
- Update README with examples
- Update API reference

---

## 8. Performance Considerations

### 8.1 Token Estimation

- Default estimation is fast (O(n) where n = text length)
- Custom tokenizer may be slower but more accurate
- Estimation happens on every message addition

### 8.2 Event Callbacks

- Callbacks should be synchronous and lightweight
- Heavy computations in callbacks will slow streaming
- Recommendation: Use `queueMicrotask()` for async work

### 8.3 Retry Backoff

- Maximum delay capped at 10 seconds
- Total maximum retry time: ~18 seconds (1+2+4+8+10...)

---

## 9. Security Considerations

### 9.1 Error Information

- Error stacks may contain sensitive information
- Truncation helps limit exposure
- Recommendation: Sanitize errors before adding to history

### 9.2 Tool Input Validation

- Library does not validate tool inputs
- Agents should validate before execution
- `NonRetryableError` can be used for validation failures

---

## 10. Backward Compatibility

All changes maintain backward compatibility:

| Change | Compatibility |
|--------|---------------|
| `chatStream()` signature | Optional `onEvent` parameter |
| `buildToolResultMessage()` | Optional `formatOptions` parameter |
| `ChatHistory` class | New class, no impact |
| `executeToolWithRetry()` | New method, no impact |
| Type additions | Additive only, no breaking changes |

---

## 11. Future Enhancements

Potential improvements for future versions:

1. **Smart Truncation** - Pin important messages (system prompt)
2. **Summary Hook** - Trigger summarization before deletion
3. **AbortSignal Support** - Cancel streaming requests
4. **Token Cache** - Cache token counts for unchanged messages
5. **Streaming Compression** - Compress history during streaming

---

## 12. References

- [Anthropic Token Counting](https://docs.anthropic.com/claude/reference/tokens)
- [Exponential Backoff Algorithm](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [AbortController API](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
