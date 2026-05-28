import React from 'react';

interface Props {
  inputTokens: number;
  outputTokens: number;
  contextWindow: number;
}

export default function TokenWarning({ inputTokens, outputTokens, contextWindow }: Props) {
  const total = inputTokens + outputTokens;
  const isWarning = total > contextWindow * 0.8;
  const isError = total > contextWindow;

  return (
    <div style={{
      padding: '8px 12px',
      borderRadius: 6,
      marginBottom: 12,
      background: isError ? '#fff0f0' : isWarning ? '#fff8e1' : '#f0fff0',
      color: isError ? '#c00' : isWarning ? '#960' : '#060',
      fontSize: 13,
    }}>
      {isError
        ? `⚠ 总 Token = ${total.toLocaleString()}，超过上下文窗口 ${contextWindow.toLocaleString()}！请减小输入或输出。`
        : isWarning
        ? `⚠ 总 Token = ${total.toLocaleString()}，接近上限 ${contextWindow.toLocaleString()}`
        : `总 Token = 输入 ${inputTokens.toLocaleString()} + 输出 ${outputTokens.toLocaleString()} = ${total.toLocaleString()}`
      }
    </div>
  );
}
