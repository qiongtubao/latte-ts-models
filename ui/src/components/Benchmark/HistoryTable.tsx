import React, { useEffect } from 'react';

interface Props {
  data: any[];
  onRefresh: () => void;
}

export default function HistoryTable({ data, onRefresh }: Props) {
  useEffect(() => { onRefresh(); }, []);

  return (
    <div className="card">
      <h3>历史记录</h3>
      {data.length === 0 ? <p>暂无记录</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>模型</th><th style={{ padding: 8 }}>输入</th><th style={{ padding: 8 }}>输出</th><th style={{ padding: 8 }}>TTFT</th><th style={{ padding: 8 }}>吞吐</th><th style={{ padding: 8 }}>状态</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{r.model}</td>
                <td style={{ padding: 8 }}>{r.inputTokens?.toLocaleString()}</td>
                <td style={{ padding: 8 }}>{r.outputTokens?.toLocaleString()}</td>
                <td style={{ padding: 8 }}>{r.ttftMs}ms</td>
                <td style={{ padding: 8 }}>{r.tokensPerSec}/s</td>
                <td style={{ padding: 8 }}>{r.status === 'normal' ? '正常' : r.status === 'truncated' ? '截断' : '错误'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
