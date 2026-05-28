import React from 'react';

export default function AutoScoreCard({ scores }: { scores: Record<string, any> }) {
  const dims = Object.entries(scores).filter(([k]) => k !== 'comment');
  const avg = dims.length > 0 ? dims.reduce((s, [, v]) => s + (v as number), 0) / dims.length : 0;

  return (
    <div style={{ marginTop: 8, padding: '8px 12px', background: '#f8f9ff', borderRadius: 8, fontSize: 13 }}>
      <strong>AI裁判评分: {avg.toFixed(1)}分</strong>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
        {dims.map(([k, v]) => (
          <span key={k}>{k}: {v as number}</span>
        ))}
      </div>
      {scores.comment && <p style={{ color: '#666', marginTop: 4 }}>{scores.comment}</p>}
    </div>
  );
}
