/**
 * JSON 提取器
 *
 * 从 LLM 输出中提取 JSON，处理各种常见问题：
 * - Markdown 代码块
 * - 尾随逗号
 * - 注释
 * - 前缀/后缀文本
 */

/**
 * 从文本中提取 JSON
 *
 * 提取流程：
 * 1. 直接解析
 * 2. 剥离 Markdown 代码块
 * 3. 查找平衡括号
 * 4. 剥离注释 + 修复尾随逗号
 * 5. 失败时返回 {}
 *
 * @param text - 包含 JSON 的文本
 * @returns 解析后的 JSON 对象，失败时返回空对象
 */
export function extractJson(text: string): any {
  if (!text || typeof text !== 'string') {
    return {};
  }

  // 步骤 1: 尝试直接解析
  try {
    return JSON.parse(text);
  } catch {
    // 继续下一步
  }

  // 步骤 2: 剥离 Markdown 代码块
  const codeBlockJson = extractFromCodeBlock(text);
  if (codeBlockJson !== null) {
    try {
      return JSON.parse(codeBlockJson);
    } catch {
      // 继续下一步
    }
  }

  // 步骤 3: 查找平衡括号
  const balancedJson = findBalancedBraces(text);
  if (balancedJson !== null) {
    // 步骤 4: 剥离注释 + 修复尾随逗号
    const cleanedJson = cleanJson(balancedJson);
    try {
      return JSON.parse(cleanedJson);
    } catch {
      // 继续尝试其他位置
    }
  }

  // 步骤 5: 返回空对象
  return {};
}

/**
 * 从 Markdown 代码块中提取内容
 *
 * @param text - 包含代码块的文本
 * @returns 代码块内容，未找到时返回 null
 */
function extractFromCodeBlock(text: string): string | null {
  // 匹配 ```json 或 ``` 代码块
  const codeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  const match = codeBlockRegex.exec(text);

  if (match && match[1]) {
    return match[1].trim();
  }

  return null;
}

/**
 * 查找平衡的括号对
 *
 * @param text - 包含 JSON 的文本
 * @returns 找到的 JSON 字符串，未找到时返回 null
 */
function findBalancedBraces(text: string): string | null {
  // 查找第一个 { 或 [
  const startMatch = text.match(/[\{\[]/);
  if (!startMatch) {
    return null;
  }

  const startIndex = startMatch.index!;
  const openChar = startMatch[0];
  const closeChar = openChar === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === openChar) {
        depth++;
      } else if (char === closeChar) {
        depth--;
        if (depth === 0) {
          const extracted = text.substring(startIndex, i + 1);
          // 验证提取的 JSON 后面没有额外的括号
          const remaining = text.substring(i + 1).trim();
          if (remaining && /^[\}\]]/.test(remaining)) {
            // 如果后面还有额外的闭合括号，说明不匹配
            return null;
          }
          return extracted;
        }
      }
    }
  }

  return null;
}

/**
 * 清理 JSON 字符串
 *
 * - 移除单行和多行注释
 * - 修复尾随逗号
 *
 * @param json - JSON 字符串
 * @returns 清理后的 JSON 字符串
 */
function cleanJson(json: string): string {
  // 移除单行注释 // ...
  let cleaned = json.replace(/\/\/.*$/gm, '');

  // 移除多行注释 /* ... */
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // 修复对象中的尾随逗号 ,}
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

  return cleaned;
}
