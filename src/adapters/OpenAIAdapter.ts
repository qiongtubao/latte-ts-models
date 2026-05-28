import OpenAI from 'openai';
import { ProviderConfig, ChatMessage, ChatOptions, ChatResponse, ChatResponseWithTools, ContentBlock, StreamEventCallback, Usage, Logger } from '../types/types';
import { IChatAdapter } from './IChatAdapter';

/** OpenAI request params whitelist for fetch mode (Phase 1, no tools) */
const ALLOWED_PARAMS = new Set([
  'model', 'messages', 'stream', 'temperature', 'max_tokens',
  'top_p', 'stop', 'presence_penalty', 'frequency_penalty', 'logit_bias', 'user',
]);

export class OpenAIAdapter implements IChatAdapter {
  private client: OpenAI | null = null;
  private readonly DEFAULT_MAX_TOKENS = 4096;
  private readonly useFetch: boolean;

  constructor(private config: ProviderConfig) {
    this.useFetch = config.baseURL !== 'https://api.openai.com';
    if (!this.useFetch) {
      this.client = new OpenAI({ apiKey: config.authToken, baseURL: config.baseURL });
    }
  }

  /**
   * Convert our ChatMessage[] to OpenAI format.
   *
   * Phase 1 limitation: tool_use and tool_result blocks are silently discarded
   * since OpenAIAdapter does not yet implement IToolUseAdapter. Messages containing
   * tool blocks will lose conversation context. See Phase 2.
   */
  private toOpenAIMessages(messages: ChatMessage[], systemPrompt?: string): any[] {
    const result: any[] = [];
    if (systemPrompt) result.push({ role: 'system', content: systemPrompt });
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content });
      } else {
        // ContentBlock[] → text for Phase 1 (no tool support yet)
        const text = msg.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map(b => b.text)
          .join('');
        result.push({ role: msg.role, content: text });
      }
    }
    return result;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const model = options?.model || '';
    const openaiMessages = this.toOpenAIMessages(messages, options?.systemPrompt);

    if (this.useFetch) {
      return this.fetchChat(model, openaiMessages, options);
    }

    // SDK branch
    const response = await this.client!.chat.completions.create({
      model,
      messages: openaiMessages as any,
      max_tokens: options?.maxTokens ?? this.DEFAULT_MAX_TOKENS,
      stream: false,
    });

    return {
      text: response.choices[0]?.message?.content || '',
      stopReason: response.choices[0]?.finish_reason || null,
      model: response.model,
      usage: response.usage ? { inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens } : undefined,
    };
  }

  async chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
    onEvent?: StreamEventCallback
  ): Promise<ChatResponseWithTools> {
    const model = options?.model || '';
    const openaiMessages = this.toOpenAIMessages(messages, options?.systemPrompt);

    if (this.useFetch) {
      return this.fetchChatStream(model, openaiMessages, options, onEvent);
    }

    // SDK branch
    const stream = await this.client!.chat.completions.create({
      model,
      messages: openaiMessages as any,
      max_tokens: options?.maxTokens ?? this.DEFAULT_MAX_TOKENS,
      stream: true,
    });

    const safeEmit = (event: Parameters<StreamEventCallback>[0]) => {
      try { onEvent?.(event); } catch (_) { /* isolate callback errors */ }
    };

    safeEmit({ type: 'stream_start', model });
    let fullText = '';
    let usage: Usage | undefined;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        safeEmit({ type: 'text', delta });
      }
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        };
      }
    }

    safeEmit({ type: 'stream_end', model, usage });

    return {
      text: fullText,
      stopReason: null,
      model,
      usage,
    };
  }

  /** Fetch-based non-streaming chat for compatible endpoints */
  private async fetchChat(
    model: string,
    messages: any[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const body: Record<string, any> = { model, messages, stream: false };
    if (options?.maxTokens) body.max_tokens = options.maxTokens;

    // Whitelist filter
    const allowed: Record<string, any> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED_PARAMS.has(key)) allowed[key] = body[key];
    }

    const res = await fetch(`${this.config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.authToken}`,
      },
      body: JSON.stringify(allowed),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenAI compatible endpoint returned ${res.status}: ${errBody}`);
    }

    const data: any = await res.json();
    return {
      text: data.choices[0]?.message?.content || '',
      stopReason: data.choices[0]?.finish_reason || null,
      model: data.model,
      usage: data.usage ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens } : undefined,
    };
  }

  /** Fetch-based streaming chat with manual SSE parsing */
  private async fetchChatStream(
    model: string,
    messages: any[],
    options?: ChatOptions,
    onEvent?: StreamEventCallback
  ): Promise<ChatResponseWithTools> {
    const body: Record<string, any> = { model, messages, stream: true };
    if (options?.maxTokens) body.max_tokens = options.maxTokens;

    const allowed: Record<string, any> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED_PARAMS.has(key)) allowed[key] = body[key];
    }

    const res = await fetch(`${this.config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.authToken}`,
      },
      body: JSON.stringify(allowed),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenAI compatible endpoint returned ${res.status}: ${errBody}`);
    }

    const safeEmit = (event: Parameters<StreamEventCallback>[0]) => {
      try { onEvent?.(event); } catch (_) { /* isolate callback errors */ }
    };

    safeEmit({ type: 'stream_start', model });
    let fullText = '';
    let usage: Usage | undefined;

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const chunk: any = JSON.parse(data);
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              safeEmit({ type: 'text', delta });
            }
            if (chunk.usage) {
              usage = {
                inputTokens: chunk.usage.prompt_tokens,
                outputTokens: chunk.usage.completion_tokens,
              };
            }
          } catch (_) {
            // Skip unparseable lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    safeEmit({ type: 'stream_end', model, usage });

    return {
      text: fullText,
      stopReason: null,
      model,
      usage,
    };
  }
}
