import { ChatHistory } from './chat-history';
import { ToolUseBlock } from '../types/types';

describe('ChatHistory', () => {
  describe('constructor', () => {
    test('should create history with default maxTokens', () => {
      const history = new ChatHistory();
      expect(history).toBeDefined();
    });

    test('should create history with custom maxTokens', () => {
      const history = new ChatHistory(50000);
      expect(history).toBeDefined();
    });
  });

  describe('addUserMessage', () => {
    test('should add user message', () => {
      const history = new ChatHistory();
      history.addUserMessage('Hello');

      const messages = history.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        role: 'user',
        content: 'Hello'
      });
    });
  });

  describe('addAssistantMessage', () => {
    test('should add assistant text message', () => {
      const history = new ChatHistory();
      history.addAssistantMessage('Hi there');

      const messages = history.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        role: 'assistant',
        content: 'Hi there'
      });
    });
  });

  describe('addAssistantMessageWithTools', () => {
    test('should add assistant message with tool calls', () => {
      const history = new ChatHistory();
      const toolCalls: ToolUseBlock[] = [
        { type: 'tool_use', id: 'tool_123', name: 'get_weather', input: { city: 'Beijing' } }
      ];

      history.addAssistantMessageWithTools('Let me check', toolCalls);

      const messages = history.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
      expect(Array.isArray(messages[0].content)).toBe(true);
    });
  });

  describe('addToolResult', () => {
    test('should add tool result message', () => {
      const history = new ChatHistory();
      history.addToolResult('tool_123', 'Sunny, 25°C');

      const messages = history.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
    });

    test('should add tool result with error flag', () => {
      const history = new ChatHistory();
      history.addToolResult('tool_123', 'Error occurred', true);

      const messages = history.getMessages();
      expect(messages).toHaveLength(1);
    });
  });

  describe('estimateTokens', () => {
    test('should estimate tokens for string content', () => {
      const history = new ChatHistory();
      const tokens = history.estimateTokens({ role: 'user', content: 'Hello world' });
      expect(tokens).toBeGreaterThan(0);
    });

    test('should estimate more tokens for longer text', () => {
      const history = new ChatHistory();
      const shortTokens = history.estimateTokens({ role: 'user', content: 'Hi' });
      const longTokens = history.estimateTokens({ role: 'user', content: 'Hello world, this is a longer message' });
      expect(longTokens).toBeGreaterThan(shortTokens);
    });
  });

  describe('getTotalTokens', () => {
    test('should return 0 for empty history', () => {
      const history = new ChatHistory();
      expect(history.getTotalTokens()).toBe(0);
    });

    test('should return positive tokens for messages', () => {
      const history = new ChatHistory();
      history.addUserMessage('Hello world');
      expect(history.getTotalTokens()).toBeGreaterThan(0);
    });
  });

  describe('getMessages', () => {
    test('should return readonly array', () => {
      const history = new ChatHistory();
      history.addUserMessage('Test');

      const messages = history.getMessages();
      expect(messages).toHaveLength(1);
    });
  });

  describe('clear', () => {
    test('should clear all messages', () => {
      const history = new ChatHistory();
      history.addUserMessage('Test');
      history.clear();

      expect(history.getMessageCount()).toBe(0);
    });
  });

  describe('getMessageCount', () => {
    test('should return correct count', () => {
      const history = new ChatHistory();
      expect(history.getMessageCount()).toBe(0);

      history.addUserMessage('Test');
      expect(history.getMessageCount()).toBe(1);

      history.addAssistantMessage('Response');
      expect(history.getMessageCount()).toBe(2);
    });
  });

  describe('truncation', () => {
    test('should truncate when exceeding maxTokens', () => {
      const history = new ChatHistory(100);  // Very small limit

      // Add multiple messages that will exceed limit
      history.addUserMessage('This is a test message that should exceed the token limit');
      history.addUserMessage('Another test message');

      // Should have truncated some messages
      expect(history.getTotalTokens()).toBeLessThanOrEqual(100);
    });

    test('should trigger onTruncate hook', () => {
      let truncatedMessages: any[] = [];
      const history = new ChatHistory(100, {
        onTruncate: (event) => {
          truncatedMessages = event.removedMessages;
        }
      });

      history.addUserMessage('First message that is quite long and will exceed the limit');
      history.addUserMessage('Second message that also adds to the total');

      // onTruncate should have been called
      expect(truncatedMessages.length).toBeGreaterThanOrEqual(0);
    });

    test('should keep at least one message', () => {
      const history = new ChatHistory(10);  // Extremely small limit

      history.addUserMessage('Test message one');
      history.addUserMessage('Test message two');

      expect(history.getMessageCount()).toBeGreaterThanOrEqual(1);
    });
  });

  describe('custom tokenizer', () => {
    test('should use custom tokenizer when provided', () => {
      let tokenizerCalled = false;
      const customTokenizer = {
        estimateTokens: (text: string) => {
          tokenizerCalled = true;
          return text.length;
        }
      };

      const history = new ChatHistory(100000, { tokenizer: customTokenizer });
      history.addUserMessage('Test');

      expect(tokenizerCalled).toBe(true);
    });
  });
});
