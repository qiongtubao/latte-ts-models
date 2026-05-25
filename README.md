# latte-ts-models

A multi-provider AI client library built on the Anthropic SDK, providing a unified API interface for calling multiple AI service providers.

## Features

- **Multi-Provider Routing** - Specify service provider and model using `"provider/model"` format
- **Automatic Retry** - Up to 3 retries for network errors, up to 20 retries for HTTP errors
- **Exponential Backoff** - `500ms * 2^n + jitter` algorithm with 24-hour maximum
- **JSON Extraction** - Handles markdown code blocks, trailing commas, and comments in LLM output
- **Multiple Configuration Methods** - Direct config, config files, or environment variables
- **Tool Use Support** ✨ NEW - Full support for Anthropic's Tool Use API with manual loop control
- **Streaming Responses** ✨ NEW - Real-time streaming with event-based callbacks
- **Usage Statistics** - Automatic tracking of call counts and token consumption

## Installation

\`\`\`bash
npm install latte-ts-models
\`\`\`

### Dependencies

This package requires \`@anthropic-ai/sdk\` as a peer dependency:

\`\`\`bash
npm install @anthropic-ai/sdk
\`\`\`

## Quick Start

\`\`\`typescript
import { AIClient } from 'latte-ts-models';

// Method 1: Direct configuration (recommended)
const ai = new AIClient({
  providers: {
    aiproxy: {
      baseURL: 'https://api.aiproxy.com/v1',
      authToken: 'your-token',
      authType: 'authToken',
      models: ['glm-5.1', 'gpt-4o']
    },
    anthropic: {
      baseURL: 'https://api.anthropic.com',
      authToken: 'sk-ant-xxx',
      authType: 'apiKey',
      models: ['claude-sonnet-4-20250514']
    }
  }
});

// Single query
const answer = await ai.query('Hello, how are you?');
console.log(answer);

// Multi-turn conversation
const response = await ai.chat([
  { role: 'user', content: 'First question' },
  { role: 'assistant', content: 'First response' },
  { role: 'user', content: 'Second question' }
], { maxTokens: 4096 });

// Specify provider and model
const result = await ai.query('hello', { model: 'aiproxy/glm-5.1' });
\`\`\`

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
        console.log(\`\nCalling tool: \${event.toolName}\`);
        break;
      case 'tool_use_input':
        // Show partial tool parameters in real-time
        break;
      case 'tool_use_end':
        console.log(\`\nTool \${event.toolName} ready to execute\`);
        break;
    }
  }
);
\`\`\`

### ChatHistory Example

\`\`\`typescript
import { AIClient, ChatHistory, ToolDefinition } from 'latte-ts-models';

const ai = new AIClient({ /* config */ });

// Create history manager with 100K token limit
const history = new ChatHistory(100_000, {
  onTruncate: (event) => {
    console.log(`Removed ${event.removedMessages.length} messages`);
    // Optionally: store in vector DB for later retrieval
  }
});

// Add user message
history.addUserMessage('What\'s the weather in Beijing?');

// Get response with tools
let response = await ai.chatWithTools(history.getMessages(), { tools });

// Add assistant response with tool calls
history.addAssistantMessageWithTools(response.text, response.toolCalls || []);

// Add tool results
for (const toolCall of response.toolCalls || []) {
  const result = await executeTool(toolCall.name, toolCall.input);
  history.addToolResult(toolCall.id, result);
}

console.log(`Total tokens: ${history.getTotalTokens()}`);
console.log(`Messages: ${history.getMessageCount()}`);
\`\`\`

### Streaming with Callbacks

\`\`\`typescript
const response = await ai.chatStream(
  history.getMessages(),
  { tools },
  (event) => {
    switch (event.type) {
      case 'stream_start':
        console.log(`Using model: ${event.model}`);
        break;
      case 'text':
        process.stdout.write(event.delta);  // Real-time typewriter effect
        break;
      case 'tool_use_start':
        console.log(`\n[Calling: ${event.toolName}]`);
        break;
      case 'tool_use_input':
        process.stdout.write('.');  // Show progress
        break;
      case 'tool_use_end':
        console.log(`[Tool ready]`);
        break;
      case 'stream_end':
        console.log(`\nDone: ${event.usage?.outputTokens} tokens`);
        break;
      case 'stream_error':
        console.error(`Error: ${event.error?.message}`);
        break;
    }
  }
);
\`\`\`

### Tool Execution with Retry

\`\`\`typescript
// Define tool executor
async function executeWeatherTool(name: string, input: any, context) {
  // Downgrade quality on retry for faster response
  const quality = context.attempt === 1 ? 'high' : 'low';
  return await fetchWeather(input.city, { quality });
}

// Execute with automatic retry
const result = await ai.executeToolWithRetry(
  toolCall,
  executeWeatherTool,
  3,  // Max 3 attempts
  {
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
\`\`\`

## Documentation

For complete documentation including:
- Configuration methods (direct, config files, environment variables)
- Provider setup and model routing
- Retry and backoff strategies
- JSON extraction utilities
- Tool Use API
- Usage statistics and monitoring

See [latte.md](./latte.md) for full documentation.

## API Reference

### \`AIClient\`

The main client class for interacting with AI providers.

#### Constructor

\`\`\`typescript
new AIClient(config?: AIClientConfig)
\`\`\`

#### Methods

- \`query(message: string, options?: QueryOptions): Promise<string>\` - Single query
- \`chat(messages: Message[], options?: ChatOptions): Promise<string>\` - Multi-turn conversation
- \`getUsage(): UsageStats\` - Get usage statistics

#### \`chatWithTools(messages, options?, logger?)\`

Execute a multi-turn conversation with Tool Use support.

**Parameters:**
- \`messages: ChatMessage[]\` - Conversation messages
- \`options?: ChatOptions\` - Chat options including tools
- \`logger?: Logger\` - Optional logger

**Returns:** \`Promise<ChatResponseWithTools>\`

#### \`chatStream(messages, options?, onEvent?, logger?)\`

Execute a streaming conversation with Tool Use support.

**Parameters:**
- \`messages: ChatMessage[]\` - Conversation messages
- \`options?: ChatOptions\` - Chat options
- \`onEvent?: (event: StreamEvent) => void\` - Event callback
- \`logger?: Logger\` - Optional logger

**Returns:** \`Promise<ChatResponseWithTools>\`

#### \`AIClient.buildToolResultMessage(toolUseId, result, isError?)\`

Build a tool result message for the next conversation turn.

**Parameters:**
- \`toolUseId: string\` - The tool_use ID to respond to
- \`result: string | ToolResultContent[]\` - Tool execution result
- \`isError?: boolean\` - Whether the result is an error

**Returns:** \`ChatMessage\`

#### \`ChatHistory\`

Manage conversation history with automatic Token counting.

**Constructor:**
- \`maxTokens: number\` - Maximum Token limit (default: 100000)
- \`options?: { tokenizer?, onTruncate? }\` - Optional configuration

**Methods:**
- \`addUserMessage(content: string)\` - Add user message
- \`addAssistantMessage(text: string)\` - Add assistant text message
- \`addAssistantMessageWithTools(text, toolCalls)\` - Add assistant message with tools
- \`addToolResult(toolUseId, result, isError?)\` - Add tool result
- \`getMessages()\` - Get all messages (readonly)
- \`getTotalTokens()\` - Get current Token count
- \`getMessageCount()\` - Get message count
- \`clear()\` - Clear all messages

#### \`executeToolWithRetry(toolCall, executor, maxRetries?, options?)\`

Execute tool with automatic retry on failure.

**Parameters:**
- \`toolCall: ToolUseBlock\` - Tool call to execute
- \`executor: ToolExecutor\` - Tool execution function
- \`maxRetries?: number\` - Maximum retry attempts (default: 3)
- \`options?: { logger?, onRetry? }\` - Optional configuration

**Returns:** \`Promise<ToolExecutionResult>\`

#### \`formatToolResult(result, isError?, options?)\`

Format tool result for LLM consumption.

**Parameters:**
- \`result: any\` - Tool execution result
- \`isError?: boolean\` - Whether this is an error result
- \`options?: FormatOptions\` - Formatting options

**Returns:** \`string | ToolResultContent[]\`

## Development

\`\`\`bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Run tests in watch mode
npm run test:watch
\`\`\`

## License

MIT

## Keywords

ai, anthropic, claude, llm, client, multi-provider, retry, backoff, json-extraction
