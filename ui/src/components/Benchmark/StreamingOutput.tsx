import React from 'react';

export default function StreamingOutput({ text }: { text: string }) {
  return (
    <div className="card">
      <h3>流式输出</h3>
      <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto', background: '#f9f9f9', padding: 12, borderRadius: 6 }}>
        {text || '(等待输出...)'}
      </pre>
    </div>
  );
}
