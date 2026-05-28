import React, { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  sessionId?: string;
  autoScore?: any;
  manualScore?: any;
}

interface Props {
  messages: Message[];
  streaming: boolean;
  onManualScore: (msgId: string, rating: number, tags: string[], comment: string) => void;
}

export default function ChatPanel({ messages, streaming, onManualScore }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <div className="card" style={{ maxHeight: 500, overflowY: 'auto' }}>
      {messages.length === 0 && <p style={{ color: '#999', textAlign: 'center' }}>选择一个角色和模型，开始问答</p>}
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} streaming={msg.role === 'ai' && streaming && msg === messages[messages.length - 1]} onManualScore={onManualScore} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
