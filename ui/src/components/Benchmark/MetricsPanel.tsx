import React from 'react';

interface Props {
  data: { ttftMs?: number; totalMs?: number; tokensPerSec?: number; error?: string };
}

export default function MetricsPanel({ data }: Props) {
  if (data.error) return <div className="card"><h3>测试结果</h3><p style={{ color: 'red' }}>错误: {data.error}</p></div>;
  return (
    <div className="card">
      <h3>实时指标</h3>
      <div style={{ display: 'flex', gap: 24 }}>
        <div><strong>TTFT:</strong> {data.ttftMs ?? '--'} ms</div>
        <div><strong>总耗时:</strong> {data.totalMs ? `${(data.totalMs / 1000).toFixed(1)}s` : '--'}</div>
        <div><strong>吞吐:</strong> {data.tokensPerSec ?? '--'} tok/s</div>
      </div>
    </div>
  );
}
