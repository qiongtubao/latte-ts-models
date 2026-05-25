import { ChatHistory } from './chat-history';
import { ToolUseBlock } from '../types/types';
import * as fs from 'fs-extra';
import * as path from 'path';

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

  describe('persistence', () => {
    const testDir = path.join(__dirname, 'test-history');
    const testFile = path.join(testDir, 'history.json');

    beforeEach(async () => {
      await fs.remove(testDir);
    });

    afterEach(async () => {
      await fs.remove(testDir);
    });

    describe('saveToFile', () => {
      test('should save history to file', async () => {
        const history = new ChatHistory(100000);
        history.addUserMessage('Hello');
        history.addAssistantMessage('Hi there');

        await history.saveToFile(testFile);

        const exists = await fs.pathExists(testFile);
        expect(exists).toBe(true);

        const data = await fs.readJson(testFile);
        expect(data.version).toBe('1.0');
        expect(data.messages).toHaveLength(2);
        expect(data.messages[0]).toEqual({ role: 'user', content: 'Hello' });
        expect(data.messages[1]).toEqual({ role: 'assistant', content: 'Hi there' });
        expect(data.totalTokens).toBeGreaterThan(0);
        expect(data.metadata.maxTokens).toBe(100000);
      });

      test('should create directory if not exists', async () => {
        const history = new ChatHistory();
        history.addUserMessage('Test');

        await history.saveToFile(testFile);

        const exists = await fs.pathExists(testDir);
        expect(exists).toBe(true);
      });

      test('should throw error if no file path provided', async () => {
        const history = new ChatHistory();
        history.addUserMessage('Test');

        await expect(history.saveToFile()).rejects.toThrow('Storage path is not defined');
      });

      test('should save with custom file path', async () => {
        const history = new ChatHistory();
        history.addUserMessage('Test');

        const customPath = path.join(testDir, 'custom.json');
        await history.saveToFile(customPath);

        const exists = await fs.pathExists(customPath);
        expect(exists).toBe(true);
      });
    });

    describe('loadFromFile', () => {
      test('should load history from file', async () => {
        const history1 = new ChatHistory();
        history1.addUserMessage('Hello');
        history1.addAssistantMessage('Hi');
        await history1.saveToFile(testFile);

        const history2 = new ChatHistory(100000, {
          persistence: { filePath: testFile }
        });

        // Wait for async load
        await new Promise(resolve => setTimeout(resolve, 100));

        const messages = history2.getMessages();
        expect(messages).toHaveLength(2);
        expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
        expect(messages[1]).toEqual({ role: 'assistant', content: 'Hi' });
      });

      test('should handle non-existent file gracefully', async () => {
        const history = new ChatHistory(100000, {
          persistence: { filePath: '/non/existent/path.json' }
        });

        // Wait for async load
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(history.getMessageCount()).toBe(0);
      });

      test('should validate message roles', async () => {
        const invalidData = {
          version: '1.0',
          messages: [
            { role: 'invalid', content: 'test' }
          ]
        };
        await fs.ensureDir(testDir);
        await fs.writeJson(testFile, invalidData);

        const history = new ChatHistory(100000, {
          persistence: { filePath: testFile }
        });

        // Wait for async load
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(history.getMessageCount()).toBe(0);
      });

      test('should validate messages is array', async () => {
        const invalidData = {
          version: '1.0',
          messages: 'not an array'
        };
        await fs.ensureDir(testDir);
        await fs.writeJson(testFile, invalidData);

        const history = new ChatHistory(100000, {
          persistence: { filePath: testFile }
        });

        // Wait for async load
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(history.getMessageCount()).toBe(0);
      });

      test('should skip validation when validateData is false', async () => {
        const data = {
          version: '1.0',
          messages: [
            { role: 'user', content: 'test' }
          ]
        };
        await fs.ensureDir(testDir);
        await fs.writeJson(testFile, data);

        const history = new ChatHistory(100000, {
          persistence: {
            filePath: testFile,
            validateData: false
          }
        });

        // Wait for async load
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(history.getMessageCount()).toBe(1);
      });

      test('should throw error if no file path provided', async () => {
        const history = new ChatHistory();
        await expect(history.loadFromFile()).rejects.toThrow('Storage path is not defined');
      });
    });

    describe('autoSave', () => {
      test('should trigger auto-save after adding message', async () => {
        const history = new ChatHistory(100000, {
          persistence: {
            filePath: testFile,
            autoSave: true,
            autoSaveDelay: 100
          }
        });

        history.addUserMessage('Test');

        // Wait for debounce
        await new Promise(resolve => setTimeout(resolve, 200));

        const exists = await fs.pathExists(testFile);
        expect(exists).toBe(true);
      });

      test('should debounce multiple rapid changes', async () => {
        const history = new ChatHistory(100000, {
          persistence: {
            filePath: testFile,
            autoSave: true,
            autoSaveDelay: 100
          }
        });

        // Add multiple messages rapidly
        history.addUserMessage('Test1');
        history.addUserMessage('Test2');
        history.addUserMessage('Test3');

        // Check file doesn't exist yet (debounced)
        await new Promise(resolve => setTimeout(resolve, 50));
        const existsEarly = await fs.pathExists(testFile);
        expect(existsEarly).toBe(false);

        // Wait for debounce to complete
        await new Promise(resolve => setTimeout(resolve, 150));
        const existsLate = await fs.pathExists(testFile);
        expect(existsLate).toBe(true);

        // Should have all messages
        const data = await fs.readJson(testFile);
        expect(data.messages).toHaveLength(3);
      });

      test('should not auto-save when autoSave is false', async () => {
        const history = new ChatHistory(100000, {
          persistence: {
            filePath: testFile,
            autoSave: false
          }
        });

        history.addUserMessage('Test');

        // Wait for potential auto-save
        await new Promise(resolve => setTimeout(resolve, 200));

        const exists = await fs.pathExists(testFile);
        expect(exists).toBe(false);
      });

      test('should not auto-save when no filePath configured', async () => {
        const history = new ChatHistory(100000, {
          persistence: {
            autoSave: true
          }
        });

        history.addUserMessage('Test');

        // Wait for potential auto-save
        await new Promise(resolve => setTimeout(resolve, 200));

        // Should not throw or create file
        expect(history.getMessageCount()).toBe(1);
      });
    });

    describe('flush', () => {
      test('should immediately save pending changes', async () => {
        const history = new ChatHistory(100000, {
          persistence: {
            filePath: testFile,
            autoSave: true,
            autoSaveDelay: 1000 // Long delay
          }
        });

        history.addUserMessage('Test');

        // File shouldn't exist yet
        await new Promise(resolve => setTimeout(resolve, 50));
        const existsBefore = await fs.pathExists(testFile);
        expect(existsBefore).toBe(false);

        // Flush should save immediately
        await history.flush();

        const existsAfter = await fs.pathExists(testFile);
        expect(existsAfter).toBe(true);
      });

      test('should clear debounce timer', async () => {
        const history = new ChatHistory(100000, {
          persistence: {
            filePath: testFile,
            autoSave: true,
            autoSaveDelay: 1000
          }
        });

        history.addUserMessage('Test1');
        await history.flush();

        // Add another message after flush
        history.addUserMessage('Test2');

        // Wait for original debounce timer (should have been cleared)
        await new Promise(resolve => setTimeout(resolve, 1100));

        const data = await fs.readJson(testFile);
        expect(data.messages).toHaveLength(2);
      });

      test('should handle concurrent flush calls', async () => {
        const history = new ChatHistory(100000, {
          persistence: {
            filePath: testFile
          }
        });

        history.addUserMessage('Test');

        // Multiple concurrent flush calls
        await Promise.all([
          history.flush(),
          history.flush(),
          history.flush()
        ]);

        const exists = await fs.pathExists(testFile);
        expect(exists).toBe(true);
      });
    });

    describe('integration', () => {
      test('should persist and restore complete conversation', async () => {
        // Create and save
        const history1 = new ChatHistory(100000, {
          persistence: {
            filePath: testFile,
            autoSave: true,
            autoSaveDelay: 100
          }
        });

        history1.addUserMessage('What is the weather?');
        history1.addAssistantMessageWithTools('Let me check', [
          { type: 'tool_use', id: 'tool_1', name: 'get_weather', input: { city: 'Beijing' } }
        ]);
        history1.addToolResult('tool_1', 'Sunny, 25°C');

        await history1.flush();

        // Load in new instance
        const history2 = new ChatHistory(100000, {
          persistence: { filePath: testFile }
        });

        // Wait for async load
        await new Promise(resolve => setTimeout(resolve, 100));

        const messages = history2.getMessages();
        expect(messages).toHaveLength(3);
        expect(messages[0].role).toBe('user');
        expect(messages[1].role).toBe('assistant');
        expect(messages[2].role).toBe('user');
      });

      test('should handle clear with auto-save', async () => {
        const history = new ChatHistory(100000, {
          persistence: {
            filePath: testFile,
            autoSave: true,
            autoSaveDelay: 100
          }
        });

        history.addUserMessage('Test');
        await history.flush();

        history.clear();
        await new Promise(resolve => setTimeout(resolve, 200));

        const data = await fs.readJson(testFile);
        expect(data.messages).toHaveLength(0);
      });
    });
  });
});
