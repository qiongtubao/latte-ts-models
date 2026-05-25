import {
  ChatMessage,
  ContentBlock,
  ToolUseBlock,
  ToolResultBlock,
  TextBlock,
  Tokenizer,
  TruncateEvent
} from '../types/types';

/**
 * Conversation history manager with Token counting and automatic truncation
 */
export class ChatHistory {
  private messages: ChatMessage[] = [];
  private maxTokens: number;
  private tokenizer?: Tokenizer;
  private onTruncate?: (event: TruncateEvent) => void;

  // Token estimation constants
  private readonly TOKENS_PER_WORD = 4;
  private readonly MESSAGE_OVERHEAD = 10;
  private readonly TOKENS_PER_CHINESE_CHAR = 1.5;

  constructor(
    maxTokens: number = 100_000,
    options?: {
      tokenizer?: Tokenizer;
      onTruncate?: (event: TruncateEvent) => void;
    }
  ) {
    this.maxTokens = maxTokens;
    this.tokenizer = options?.tokenizer;
    this.onTruncate = options?.onTruncate;
  }

  /**
   * Estimate text Token count
   */
  private estimateTextTokens(text: string): number {
    if (!text) return 0;

    // Use custom tokenizer if provided
    if (this.tokenizer) {
      return this.tokenizer.estimateTokens(text);
    }

    // Default estimation: words × 4 + chars × 0.5
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const charCount = text.length;

    return Math.ceil((wordCount * this.TOKENS_PER_WORD) + (charCount * 0.5));
  }

  /**
   * Estimate Token count for a single message
   */
  estimateTokens(message: ChatMessage): number {
    let tokens = this.MESSAGE_OVERHEAD;

    if (typeof message.content === 'string') {
      tokens += this.estimateTextTokens(message.content);
    } else {
      for (const block of message.content) {
        if (block.type === 'text') {
          tokens += this.estimateTextTokens((block as TextBlock).text) + 1;
        } else if (block.type === 'tool_use') {
          const toolBlock = block as ToolUseBlock;
          tokens += this.estimateTextTokens(toolBlock.name);
          tokens += this.estimateTextTokens(JSON.stringify(toolBlock.input)) + 5;
        } else if (block.type === 'tool_result') {
          const resultBlock = block as ToolResultBlock;
          const content = resultBlock.content;
          const contentStr = typeof content === 'string'
            ? content
            : content.map(c => typeof c === 'string' ? c : (c as TextBlock).text).join(' ');
          tokens += this.estimateTextTokens(contentStr) + 3;
        }
      }
    }

    return tokens;
  }

  /**
   * Get total Token count
   */
  getTotalTokens(): number {
    return this.messages.reduce((sum, msg) => sum + this.estimateTokens(msg), 0);
  }

  /**
   * Enforce Token limit by truncating oldest messages
   */
  private enforceLimit(): void {
    if (this.getTotalTokens() <= this.maxTokens) return;

    const removedMessages: ChatMessage[] = [];

    // Remove oldest messages until under limit or only one left
    while (this.messages.length > 1 && this.getTotalTokens() > this.maxTokens) {
      const removed = this.messages.shift()!;
      removedMessages.push(removed);
    }

    // Trigger hook if messages were removed
    if (removedMessages.length > 0 && this.onTruncate) {
      this.onTruncate({
        removedMessages,
        remainingTokens: this.getTotalTokens()
      });
    }
  }

  /**
   * Add user message
   */
  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
    this.enforceLimit();
  }

  /**
   * Add assistant text message
   */
  addAssistantMessage(text: string): void {
    this.messages.push({ role: 'assistant', content: text });
    this.enforceLimit();
  }

  /**
   * Add assistant message with tool calls
   */
  addAssistantMessageWithTools(text: string, toolCalls: ToolUseBlock[]): void {
    const content: ContentBlock[] = [
      { type: 'text', text },
      ...toolCalls
    ];
    this.messages.push({ role: 'assistant', content });
    this.enforceLimit();
  }

  /**
   * Add tool result message
   */
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
  }

  /**
   * Get all messages (readonly)
   */
  getMessages(): readonly ChatMessage[] {
    return Object.freeze([...this.messages]);
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messages = [];
  }

  /**
   * Get message count
   */
  getMessageCount(): number {
    return this.messages.length;
  }
}
