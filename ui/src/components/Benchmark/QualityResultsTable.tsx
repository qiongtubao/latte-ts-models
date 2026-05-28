import React from 'react';
import { QualityTestResult } from '../../api/quality';

interface Props {
  results: QualityTestResult[];
  dimensions: string[];
}

function scoreColor(score: number): string {
  if (score >= 7) return '#e8f5e9';
  if (score >= 5) return '#fff8e1';
  return '#fce4ec';
}

function scoreTextColor(score: number): string {
  if (score >= 7) return '#2e7d32';
  if (score >= 5) return '#f57f17';
  return '#c62828';
}

export default function QualityResultsTable({ results, dimensions }: Props) {
  if (results.length === 0) return null;

  const sorted = [...results].sort((a, b) => a.windowSize - b.windowSize);

  const formatSize = (tokens: number) =>
    tokens >= 1024 ? `${(tokens / 1024).toFixed(0)}K` : `${tokens}`;

  const avgScore = (r: QualityTestResult) => {
    const vals = Object.values(r.scores);
    if (vals.length === 0) return 0;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };

  return (
    <div style={{ marginTop: 16 }}>
      <h4>测试结果</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
            <th style={{ padding: 8 }}>窗口大小</th>
            {dimensions.map(d => (
              <th key={d} style={{ padding: 8 }}>{d}</th>
            ))}
            <th style={{ padding: 8 }}>综合</th>
            <th style={{ padding: 8 }}>模型回答</th>
            <th style={{ padding: 8 }}>状态</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8, fontWeight: 600 }}>{formatSize(r.windowSize)}</td>
              {dimensions.map(d => {
                const val = r.scores[d];
                const hasScore = val !== undefined && r.status === 'success';
                return (
                  <td key={d} style={{
                    padding: 8,
                    background: hasScore ? scoreColor(val) : '#f5f5f5',
                    color: hasScore ? scoreTextColor(val) : '#999',
                    fontWeight: hasScore ? 600 : 400,
                  }}>
                    {hasScore ? val : '--'}
                  </td>
                );
              })}
              <td style={{
                padding: 8,
                fontWeight: 700,
                fontSize: 14,
                color: r.status === 'success' ? scoreTextColor(avgScore(r)) : '#999',
              }}>
                {r.status === 'success' ? avgScore(r) : '--'}
              </td>
              <td style={{ padding: 8, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.modelAnswer || ''}>
                {r.modelAnswer ? (r.modelAnswer.length > 60 ? r.modelAnswer.slice(0, 60) + '...' : r.modelAnswer) : '--'}
              </td>
              <td style={{ padding: 8 }}>
                {r.status === 'success'
                  ? <span style={{ color: '#2e7d32' }}>完成</span>
                  : <span style={{ color: '#c62828' }} title={r.errorMessage}>错误</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.some(r => r.comment) && (
        <div style={{ marginTop: 12 }}>
          <h4>评分详情</h4>
          {sorted.filter(r => r.comment).map((r, i) => (
            <div key={i} style={{ marginBottom: 8, padding: '8px 12px', background: '#f9f9f9', borderRadius: 4, fontSize: 13 }}>
              <strong>{formatSize(r.windowSize)}:</strong> {r.comment}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
