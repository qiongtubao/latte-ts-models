import { ToolResultContent, FormatOptions } from '../types/types';

/**
 * Truncate error stack to maximum number of lines
 */
export function truncateErrorStack(error: string, maxLines: number): string {
  const lines = error.split('\n');

  if (lines.length <= maxLines) {
    return error;
  }

  return lines.slice(0, maxLines).join('\n') +
    `\n... (${lines.length - maxLines} more lines truncated)`;
}

/**
 * Format tool result for LLM consumption
 */
export function formatToolResult(
  result: any,
  isError: boolean = false,
  options: FormatOptions = {}
): string | ToolResultContent[] {
  const {
    maxErrorLines = 10,
    jsonIndent = 2,
    useMarkdown = true
  } = options;

  // If already a string
  if (typeof result === 'string') {
    if (isError) {
      return truncateErrorStack(result, maxErrorLines);
    }
    return result;
  }

  // If Error object
  if (result instanceof Error) {
    const errorStr = result.stack || result.message;
    return truncateErrorStack(errorStr, maxErrorLines);
  }

  // If object or array
  if (typeof result === 'object' && result !== null) {
    const jsonStr = JSON.stringify(result, null, jsonIndent);

    if (isError) {
      return truncateErrorStack(jsonStr, maxErrorLines);
    }

    if (useMarkdown) {
      return `\`\`\`json\n${jsonStr}\n\`\`\``;
    }

    return jsonStr;
  }

  // Other types: convert to string
  const strResult = String(result);

  if (isError) {
    return truncateErrorStack(strResult, maxErrorLines);
  }

  return strResult;
}
