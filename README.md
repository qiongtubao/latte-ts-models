# latte-ts-models

A multi-provider AI client library built on the Anthropic SDK, providing a unified API interface for calling multiple AI service providers.

## Features

- **Multi-Provider Routing** - Specify service provider and model using `"provider/model"` format
- **Automatic Retry** - Up to 3 retries for network errors, up to 20 retries for HTTP errors
- **Exponential Backoff** - `500ms * 2^n + jitter` algorithm with 24-hour maximum
- **JSON Extraction** - Handles markdown code blocks, trailing commas, and comments in LLM output
- **Multiple Configuration Methods** - Direct config, config files, or environment variables
- **Tool Use Support** - Streaming mode Tool Use API to avoid 10-minute timeout warnings
- **Usage Statistics** - Automatic tracking of call counts and token consumption

## Installation

```bash
npm install latte-ts-models
```

### Dependencies

This package requires `@anthropic-ai/sdk` as a peer dependency:

```bash
npm install @anthropic-ai/sdk
```

## Quick Start

```typescript
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
```

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

### `AIClient`

The main client class for interacting with AI providers.

#### Constructor

```typescript
new AIClient(config?: AIClientConfig)
```

#### Methods

- `query(message: string, options?: QueryOptions): Promise<string>` - Single query
- `chat(messages: Message[], options?: ChatOptions): Promise<string>` - Multi-turn conversation
- `getUsage(): UsageStats` - Get usage statistics

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Run tests in watch mode
npm run test:watch
```

## License

MIT

## Keywords

ai, anthropic, claude, llm, client, multi-provider, retry, backoff, json-extraction
