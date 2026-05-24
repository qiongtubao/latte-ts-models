# Tool Use and Streaming Support Design

**Date:** 2026-05-25
**Status:** Approved
**Author:** Claude + User Collaboration

---

## Executive Summary

This document outlines the design for adding comprehensive Tool Use and Streaming Response support to the `latte-ts-models` library. The library is designed as an API client for building AI Agent systems, and these features are critical for Agent workflows.

### Key Features

- **Tool Use API** - Full support for Anthropic's Tool Use with manual loop control
- **Streaming Responses** - Real-time event-based streaming with Tool Use support
- **Strict TypeScript Types** - Comprehensive type safety for all Tool Use scenarios
- **Backward Compatibility** - New methods added, existing methods unchanged

---

## 1. Problem Analysis

### 1.1 Current State

The `latte-ts-models` library currently provides:

- ✅ Multi-provider routing
- ✅ Basic query and chat methods
- ✅ Automatic retry with exponential backoff
- ✅ JSON extraction utilities
- ✅ Usage statistics tracking

### 1.2 Missing Features

The README claims support for features that are not implemented:

- ❌ Tool Use API (README line 12)
- ❌ Streaming responses (README line 12)

### 1.3 Current Limitations

- `ChatMessage` type only supports `string` content
- No type definitions for tool definitions and tool calls
- No streaming event handling mechanism
- No way to build multi-turn tool use conversations

---

## 2. Requirements

### 2.1 Use Case: AI Agent System

The primary use case is building AI Agent systems that need:

1. **Manual Tool Loop Control** - Agent decides when to execute tools, handles errors, and manages state
2. **Real-time Progress** - Users need to see Agent thinking and tool execution in real-time
3. **Complex Workflows** - Tools may call other tools, need error recovery and retry logic
4. **Context Management** - Long conversations with multiple tool calls need message history management

### 2.2 Design Principles

1. **Backward Compatibility** - Existing code must continue working
2. **Strict Types** - Full TypeScript type safety, no `any` where possible
3. **Library Layer Separation** - Library handles API errors, Agent handles tool errors
4. **High Priority Streaming** - Real-time feedback is critical for Agent UX
5. **Manual Loop Control** - Agent maintains full control over tool execution flow

---

## 3. Architecture

### 3.1 Type System

#### Core Content Block Types

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

#### Message Types

```typescript
/**
 * Chat message (extended for Tool Use)
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];  // String or content block array
}

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

/**
 * Chat options (extended for tools)
 */
export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: ToolDefinition[];  // Tool list
  toolChoice?: 'auto' | 'any' | { type: 'tool'; name: string };  // Tool selection strategy
}
```

#### Response Types

```typescript
/**
 * Chat response with Tool Use
 */
export interface ChatResponseWithTools extends ChatResponse {
  contentBlocks?: ContentBlock[];  // All content blocks
  toolCalls?: ToolUseBlock[];  // Tool calls only
}

/**
 * Stream event
 */
export interface StreamEvent {
  type: 'text' | 'tool_use_start' | 'tool_use_input' | 'tool_use_end' | 'tool_result' | 'message_stop';
  delta?: string;  // Text delta
  toolName?: string;  // Tool name
  toolId?: string;  // Tool ID
  partialInput?: any;  // Partial input
  result?: string | ToolResultContent[];  // Tool result
}
```

#### Error Types

```typescript
/**
 * Stream interrupted error
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
 * Context length exceeded error
 */
export class ContextLengthExceededError extends NonRetryableError {
  constructor(message: string) {
    super(message);
    this.name = 'ContextLengthExceededError';
  }
}
```

---

### 3.2 API Methods

#### 3.2.1 chatWithTools()

```typescript
/**
 * Multi-turn conversation with Tool Use
 *
 * @param messages - Conversation messages
 * @param options? - Chat options (including tools)
 * @param logger? - Optional logger
 * @returns Complete conversation response with tool calls
 */
async chatWithTools(
  messages: ChatMessage[],
  options?: ChatOptions,
  logger?: Logger
): Promise<ChatResponseWithTools>
```

**Implementation Logic:**

1. Resolve model (reuse `resolveModel()`)
2. Build request params including `tools` and `tool_choice`
3. Call Anthropic API (reuse `executeWithRetry()`)
4. Extract content blocks: text blocks + tool use blocks
5. Update usage statistics
6. Return structured response

**Key Considerations:**

- Reuse existing client cache mechanism
- Reuse existing retry logic
- Only handle API-level errors, tool execution errors are handled by Agent

#### 3.2.2 chatStream()

```typescript
/**
 * Streaming conversation with Tool Use
 *
 * @param messages - Conversation messages
 * @param options? - Chat options
 * @param onEvent? - Event callback
 * @param logger? - Optional logger
 * @returns Final response
 */
async chatStream(
  messages: ChatMessage[],
  options?: ChatOptions,
  onEvent?: (event: FlowEvent) => void,
  logger?: Logger
): Promise<ChatResponseWithTools>
```

**Implementation Logic:**

1. Create streaming request: `client.messages.stream()`
2. Register event listeners:
   - `text` event → Accumulate text, trigger `StreamEvent.text`
   - `contentBlockStart` event → Detect `tool_use`, trigger `StreamEvent.tool_use_start`
   - `inputJson` event → Update tool input, trigger `StreamEvent.tool_use_input`
   - `contentBlockStop` event → Trigger `StreamEvent.tool_use_end`
3. Wait for stream completion: `stream.finalMessage()`
4. Extract all content blocks
5. Update usage statistics
6. Return final response

**Event Flow Example:**

```
text: "Let me"
text: " check"
text: " that"
tool_use_start: { toolName: "get_weather", toolId: "tool_123" }
tool_use_input: { partialInput: { city: "Beij" } }
tool_use_input: { partialInput: { city: "Beijing" } }
tool_use_end: { toolId: "tool_123" }
message_stop: {}
```

**Critical Implementation Details:**

- Content blocks must maintain correct order (text + tool_use interleaved)
- Use `contentBlockStart` and `contentBlockStop` events to track block boundaries
- On stream interruption, throw `StreamInterruptedError` with partial data

#### 3.2.3 Helper Methods

```typescript
/**
 * Convert ChatMessage to Anthropic SDK format
 */
private convertMessagesToAnthropic(
  messages: ChatMessage[]
): Anthropic.Messages.MessageParam[]

/**
 * Extract content blocks (type-safe version)
 */
private extractContentBlocks(
  content: Anthropic.Messages.ContentBlock[]
): ContentBlock[]

/**
 * Extract tool calls from response
 */
static extractToolCalls(response: ChatResponseWithTools): ToolUseBlock[]

/**
 * Build tool result message
 */
static buildToolResultMessage(
  toolUseId: string,
  result: string | ToolResultContent[],
  isError?: boolean
): ChatMessage
```

---

### 3.3 Error Handling

#### Error Layer Separation

**API Layer Errors (Library handles):**
- Network errors → Automatic retry (reuse existing logic)
- HTTP 429 → Exponential backoff retry
- HTTP 4xx (except 429) → Throw `NonRetryableError`
- HTTP 5xx → Retry

**Tool Execution Errors (Agent handles):**
- Library doesn't handle tool execution, only transmits `tool_result`
- Agent decides how to handle `is_error: true`

**Streaming Errors:**
- Stream interruption → Throw `StreamInterruptedError` with partial data
- Agent can use partial data or retry

---

### 3.4 Edge Cases

#### Case 1: Empty Tool List

```typescript
if (options?.tools && options.tools.length === 0) {
  // Ignore tools parameter, process as normal conversation
}
```

#### Case 2: Multiple Tool Calls

```typescript
// Single response may contain multiple tool_use
toolCalls.forEach(toolCall => {
  // Agent needs to execute each one
});
```

#### Case 3: Mixed Content

```typescript
// Response may contain both text and tool calls
response.contentBlocks = [
  { type: 'text', text: 'I will help you.' },
  { type: 'tool_use', id: '1', name: 'search', input: {...} },
  { type: 'tool_use', id: '2', name: 'lookup', input: {...} }
];
```

#### Case 4: Context Length Exceeded

```typescript
// Catch 400 Bad Request with context_length_exceeded
try {
  const response = await ai.chatWithTools(messages, { tools });
} catch (error) {
  if (error instanceof ContextLengthExceededError) {
    // Agent should truncate message history or compress context
  }
}
```

---

## 4. Implementation Plan

### 4.1 File Changes

#### Modified Files

1. **`src/types/types.ts`**
   - Add all new type definitions
   - Add new error classes

2. **`src/core/ai-client.ts`**
   - Add `chatWithTools()` method
   - Add `chatStream()` method
   - Add `convertMessagesToAnthropic()` private method
   - Add `extractContentBlocks()` private method
   - Add `buildToolResultMessage()` static method

3. **`src/index.ts`**
   - Export all new types
   - Export new error classes

4. **`README.md`**
   - Update features list
   - Add Tool Use example
   - Add streaming example
   - Update API reference

### 4.2 New Files

1. **`tests/unit/chat-with-tools.test.ts`**
   - Unit tests for `chatWithTools()`

2. **`tests/unit/chat-stream.test.ts`**
   - Unit tests for `chatStream()`

3. **`tests/integration/tool-use-loop.test.ts`**
   - Integration tests for full tool use cycle

---

## 5. Testing Strategy

### 5.1 Unit Tests

**Test Coverage:**

- `chatWithTools()` without tools → returns text response
- `chatWithTools()` with tools → returns tool calls
- `chatWithTools()` with mixed content → returns both text and tool calls
- `chatWithTools()` with empty tools array → processes as normal conversation
- `chatStream()` streaming text → accumulates text correctly
- `chatStream()` streaming tool use → triggers correct events in order
- `chatStream()` interruption → throws `StreamInterruptedError` with partial data
- Message conversion → handles string, TextBlock, ToolUseBlock, ToolResultBlock

### 5.2 Integration Tests

**Test Scenarios:**

- Full tool use loop (user → tool_use → execute → tool_result → response)
- Multiple tool calls in single response
- Error handling (API errors, tool errors)
- Long conversation with message history

---

## 6. Performance and Security

### 6.1 Performance Considerations

1. **Client Reuse** - Cache Anthropic clients per provider (already implemented)
2. **Message History Management** - Agent should implement truncation logic
3. **Concurrent Control** - Agent should use queue for rate limiting

### 6.2 Security Considerations

1. **Tool Input Validation** - Agent should validate inputs before execution
2. **Sensitive Data Handling** - Agent should sanitize results before logging
3. **Tool Permission Control** - Agent should check user permissions

---

## 7. Documentation Updates

### 7.1 README Updates

- Update features list with ✨ NEW badges
- Add Tool Use example in Quick Start
- Add streaming example
- Add API reference for new methods

### 7.2 API Documentation

Add documentation for:

- `chatWithTools(messages, options?, logger?)`
- `chatStream(messages, options?, onEvent?, logger?)`
- `AIClient.buildToolResultMessage(toolUseId, result, isError?)`
- All new type definitions

---

## 8. Usage Examples

### 8.1 Basic Tool Use Loop

```typescript
import { AIClient, ChatMessage, ToolDefinition } from 'latte-ts-models';

const ai = new AIClient({ /* config */ });

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

const messages: ChatMessage[] = [
  { role: 'user', content: 'What\'s the weather in Beijing?' }
];

// First call
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
```

### 8.2 Streaming with Progress Display

```typescript
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
        process.stdout.write('.');
        break;
      case 'tool_use_end':
        console.log(`\nTool ${event.toolName} ready to execute`);
        break;
    }
  }
);
```

---

## 9. Future Enhancements

Potential improvements for future versions:

1. **Optional Zod Schemas** - Export validation schemas for runtime checking
2. **Multi-vendor Adapter Layer** - If OpenAI/Gemini support is needed
3. **Built-in Message History Management** - Auto-truncation based on token count
4. **Tool Definition Helpers** - Builders for common tool patterns
5. **Caching Layer** - Cache repeated tool calls with same inputs

---

## 10. References

- [Anthropic Tool Use Documentation](https://docs.anthropic.com/en/docs/tool-use)
- [Anthropic Streaming API](https://docs.anthropic.com/en/api/streaming)
- [JSON Schema Specification](https://json-schema.org/)
