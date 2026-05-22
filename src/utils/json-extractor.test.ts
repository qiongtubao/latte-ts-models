import { extractJson } from './json-extractor';

describe('JSON提取器', () => {
  describe('直接解析', () => {
    test('解析标准 JSON 对象', () => {
      const text = '{"name": "test", "value": 123}';
      expect(extractJson(text)).toEqual({ name: 'test', value: 123 });
    });

    test('解析标准 JSON 数组', () => {
      const text = '[1, 2, 3]';
      expect(extractJson(text)).toEqual([1, 2, 3]);
    });

    test('解析空对象', () => {
      const text = '{}';
      expect(extractJson(text)).toEqual({});
    });

    test('解析空数组', () => {
      const text = '[]';
      expect(extractJson(text)).toEqual([]);
    });
  });

  describe('Markdown 代码块处理', () => {
    test('提取 ```json 代码块中的 JSON', () => {
      const text = '```json\n{"name": "test"}\n```';
      expect(extractJson(text)).toEqual({ name: 'test' });
    });

    test('提取 ``` 代码块中的 JSON（无语言标记）', () => {
      const text = '```\n{"name": "test"}\n```';
      expect(extractJson(text)).toEqual({ name: 'test' });
    });

    test('处理带前缀文本的代码块', () => {
      const text = '这是结果：\n```json\n{"name": "test"}\n```\n结束';
      expect(extractJson(text)).toEqual({ name: 'test' });
    });

    test('处理多行 JSON 代码块', () => {
      const text = '```json\n{\n  "name": "test",\n  "value": 123\n}\n```';
      expect(extractJson(text)).toEqual({ name: 'test', value: 123 });
    });
  });

  describe('平衡括号查找', () => {
    test('从前缀文本中提取 JSON', () => {
      const text = '这是 JSON 数据：{"name": "test"}';
      expect(extractJson(text)).toEqual({ name: 'test' });
    });

    test('从后缀文本中提取 JSON', () => {
      const text = '{"name": "test"} 这是结果';
      expect(extractJson(text)).toEqual({ name: 'test' });
    });

    test('处理嵌套对象', () => {
      const text = '数据：{"outer": {"inner": "value"}}';
      expect(extractJson(text)).toEqual({ outer: { inner: 'value' } });
    });

    test('处理包含字符串中的括号', () => {
      const text = '{"text": "包含 {括号} 的字符串"}';
      expect(extractJson(text)).toEqual({ text: '包含 {括号} 的字符串' });
    });

    test('处理包含转义引号的字符串', () => {
      const text = '{"text": "包含\\"引号\\"的字符串"}';
      expect(extractJson(text)).toEqual({ text: '包含"引号"的字符串' });
    });
  });

  describe('注释和尾随逗号处理', () => {
    test('移除单行注释', () => {
      const text = '{\n  "name": "test", // 这是注释\n  "value": 123\n}';
      expect(extractJson(text)).toEqual({ name: 'test', value: 123 });
    });

    test('移除多行注释', () => {
      const text = '{\n  /* 这是\n  多行注释 */\n  "name": "test"\n}';
      expect(extractJson(text)).toEqual({ name: 'test' });
    });

    test('移除对象中的尾随逗号', () => {
      const text = '{"name": "test", "value": 123,}';
      expect(extractJson(text)).toEqual({ name: 'test', value: 123 });
    });

    test('移除数组中的尾随逗号', () => {
      const text = '[1, 2, 3,]';
      expect(extractJson(text)).toEqual([1, 2, 3]);
    });

    test('处理嵌套对象中的尾随逗号', () => {
      const text = '{"outer": {"inner": "value",},}';
      expect(extractJson(text)).toEqual({ outer: { inner: 'value' } });
    });

    test('同时处理注释和尾随逗号', () => {
      const text = '{\n  "name": "test", // 注释\n  "value": 123, // 另一个注释\n}';
      expect(extractJson(text)).toEqual({ name: 'test', value: 123 });
    });
  });

  describe('失败情况', () => {
    test('无效 JSON 返回空对象', () => {
      const text = '这不是 JSON';
      expect(extractJson(text)).toEqual({});
    });

    test('空字符串返回空对象', () => {
      const text = '';
      expect(extractJson(text)).toEqual({});
    });

    test('只有空白字符返回空对象', () => {
      const text = '   \n\t  ';
      expect(extractJson(text)).toEqual({});
    });

    test('不完整的 JSON 返回空对象', () => {
      const text = '{"name": "test"';
      expect(extractJson(text)).toEqual({});
    });

    test('不匹配的括号返回空对象', () => {
      const text = '{"name": "test"}}';
      expect(extractJson(text)).toEqual({});
    });
  });

  describe('复杂场景', () => {
    test('LLM 输出：带前缀、代码块、注释和尾随逗号', () => {
      const text = `根据分析，结果如下：

\`\`\`json
{
  "status": "success", // 状态
  "data": {
    "items": [1, 2, 3,], // 数据项
  },
}
\`\`\`

以上是结果。`;
      expect(extractJson(text)).toEqual({
        status: 'success',
        data: { items: [1, 2, 3] }
      });
    });

    test('处理包含特殊字符的 JSON', () => {
      const text = '{"text": "换行\\n制表符\\t引号\\""}';
      expect(extractJson(text)).toEqual({ text: '换行\n制表符\t引号"' });
    });

    test('处理 Unicode 字符', () => {
      const text = '{"text": "中文测试 \\u4e2d\\u6587"}';
      expect(extractJson(text)).toEqual({ text: '中文测试 中文' });
    });

    test('处理数字类型', () => {
      const text = '{"int": 123, "float": 45.67, "negative": -89, "exp": 1.2e3}';
      expect(extractJson(text)).toEqual({
        int: 123,
        float: 45.67,
        negative: -89,
        exp: 1200
      });
    });

    test('处理布尔值和 null', () => {
      const text = '{"bool": true, "false": false, "null": null}';
      expect(extractJson(text)).toEqual({
        bool: true,
        false: false,
        null: null
      });
    });
  });
});
