import { formatToolResult, truncateErrorStack } from './tool-result-formatter';

describe('formatToolResult', () => {
  describe('string input', () => {
    test('should return string as-is for normal result', () => {
      const result = formatToolResult('Hello world');
      expect(result).toBe('Hello world');
    });

    test('should truncate string for error result', () => {
      const longError = 'Error\n' + 'line\n'.repeat(20);
      const result = formatToolResult(longError, true, { maxErrorLines: 5 });

      expect(typeof result).toBe('string');
      expect((result as string).split('\n').length).toBeLessThanOrEqual(6);  // 5 lines + truncation message
    });
  });

  describe('Error object input', () => {
    test('should format Error stack', () => {
      const error = new Error('Test error');
      const result = formatToolResult(error, true);

      expect(typeof result).toBe('string');
      expect((result as string)).toContain('Error: Test error');
    });
  });

  describe('object input', () => {
    test('should convert object to Markdown code block', () => {
      const data = { temp: 25, city: 'Beijing' };
      const result = formatToolResult(data);

      expect(typeof result).toBe('string');
      expect((result as string)).toContain('```json');
      expect((result as string)).toContain('"temp"');
      expect((result as string)).toContain('"city"');
    });

    test('should not use Markdown when useMarkdown is false', () => {
      const data = { temp: 25 };
      const result = formatToolResult(data, false, { useMarkdown: false });

      expect(typeof result).toBe('string');
      expect((result as string)).not.toContain('```');
    });

    test('should use custom JSON indent', () => {
      const data = { a: 1 };
      const result = formatToolResult(data, false, { jsonIndent: 4 });

      expect(typeof result).toBe('string');
      expect((result as string)).toContain('    "a"');  // 4 spaces
    });
  });

  describe('array input', () => {
    test('should convert array to JSON', () => {
      const data = [1, 2, 3];
      const result = formatToolResult(data);

      expect(typeof result).toBe('string');
      expect((result as string)).toContain('```json');
      expect((result as string)).toContain('1');
      expect((result as string)).toContain('2');
      expect((result as string)).toContain('3');
    });
  });

  describe('other types', () => {
    test('should convert number to string', () => {
      const result = formatToolResult(42);
      expect(result).toBe('42');
    });

    test('should convert boolean to string', () => {
      const result = formatToolResult(true);
      expect(result).toBe('true');
    });

    test('should convert null to string', () => {
      const result = formatToolResult(null);
      expect(result).toBe('null');
    });
  });
});

describe('truncateErrorStack', () => {
  test('should not truncate short errors', () => {
    const error = 'Error: Test\n  at line 1\n  at line 2';
    const result = truncateErrorStack(error, 10);

    expect(result).toBe(error);
  });

  test('should truncate long errors', () => {
    const error = 'Error:\n' + 'line\n'.repeat(20);
    const result = truncateErrorStack(error, 5);

    const lines = result.split('\n');
    expect(lines.length).toBe(6);  // 5 lines + truncation message
    expect(result).toContain('more lines truncated');
  });

  test('should respect maxLines parameter', () => {
    const error = 'line\n'.repeat(100);
    const result = truncateErrorStack(error, 3);

    const lines = result.split('\n');
    expect(lines.length).toBe(4);  // 3 lines + message
  });
});
