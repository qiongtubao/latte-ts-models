import React from 'react';
import { Role } from '../../api/chat';
import RadarChart from './RadarChart';

interface Props {
  report: Record<string, Record<string, number>>;
  roles: Role[];
  onClose: () => void;
}

export default function ReportPanel({ report, roles, onClose }: Props) {
  const roleNames: Record<string, string> = {};
  roles.forEach(r => { roleNames[r.id] = r.name; });

  const roleEntries = Object.entries(report);
  if (roleEntries.length === 0) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>评分报告</h3>
        <p>暂无评分数据</p>
        <button className="btn" onClick={onClose}>关闭</button>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 680 }}>
        <h3>综合评分报告</h3>
        {roleEntries.map(([roleId, dims]) => (
          <div key={roleId} style={{ marginBottom: 24 }}>
            <h4>{roleNames[roleId] || roleId}</h4>
            <RadarChart dimensions={dims} />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
              {Object.entries(dims).map(([dim, val]) => (
                <span key={dim}>{dim}: {val}</span>
              ))}
            </div>
          </div>
        ))}
        <button className="btn" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
