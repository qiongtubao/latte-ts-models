import React from 'react';
import AutoScoreCard from './AutoScoreCard';
import ManualScoreCard from './ManualScoreCard';

interface Props {
  message: { id: string; role: string; content: string; autoScore?: any; manualScore?: any; sessionId?: string };
  streaming: boolean;
  onManualScore: (msgId: string, rating: number, tags: string[], comment: string) => void;
}

export default function MessageBubble({ message, streaming, onManualScore }: Props) {
  const isUser = message.role === 'user';
  return (
    <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '80%',
        padding: '12px 16px',
        borderRadius: 12,
        background: isUser ? '#4361ee' : '#f0f0f0',
        color: isUser ? '#fff' : '#333',
        whiteSpace: 'pre-wrap',
      }}>
        {isUser ? '你' : 'AI'}: {message.content}
        {streaming && <span className="cursor-blink">|</span>}
      </div>
      {!isUser && message.autoScore && <AutoScoreCard scores={message.autoScore} />}
      {!isUser && message.sessionId && !message.manualScore && (
        <ManualScoreCard messageId={message.id} onSubmit={onManualScore} />
      )}
      {!isUser && message.manualScore && (
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          人工评分: {'★'.repeat(message.manualScore.rating)}{'☆'.repeat(5 - message.manualScore.rating)}
          {message.manualScore.tags?.length > 0 && ` [${message.manualScore.tags.join(', ')}]`}
        </div>
      )}
    </div>
  );
}
