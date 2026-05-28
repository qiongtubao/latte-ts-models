import React, { useEffect, useState } from 'react';
import { configApi, JudgeConfig } from '../../api/config';

const ALL_DIMENSIONS = ['准确性', '逻辑性', '代码质量', '完整性', '可读性', '安全性', '边界覆盖度', '用例可执行性', '推理深度', '结构清晰度', '创造性'];

export default function JudgeModelConfig() {
  const [judge, setJudge] = useState<JudgeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    configApi.getJudge().then(setJudge).finally(() => setLoading(false));
  }, []);

  const toggleDimension = (dim: string) => {
    if (!judge) return;
    const dims = judge.dimensions.includes(dim)
      ? judge.dimensions.filter(d => d !== dim)
      : [...judge.dimensions, dim];
    setJudge({ ...judge, dimensions: dims });
  };

  const handleSave = () => {
    if (judge) configApi.setJudge(judge).then(() => alert('裁判模型配置已保存'));
  };

  if (loading) return null;

  return (
    <div className="card">
      <h3>裁判模型设置</h3>
      <div className="form-group">
        <label>Provider</label>
        <input value={judge?.provider || ''} onChange={e => setJudge(j => j ? { ...j, provider: e.target.value } : { provider: e.target.value, model: '', dimensions: [] })} />
      </div>
      <div className="form-group">
        <label>Model</label>
        <input value={judge?.model || ''} onChange={e => setJudge(j => j ? { ...j, model: e.target.value } : { provider: '', model: e.target.value, dimensions: [] })} />
      </div>
      <div className="form-group">
        <label>评分维度</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ALL_DIMENSIONS.map(dim => (
            <label key={dim} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={judge?.dimensions.includes(dim) || false} onChange={() => toggleDimension(dim)} />
              {dim}
            </label>
          ))}
        </div>
      </div>
      <button className="btn btn-primary" onClick={handleSave}>保存裁判配置</button>
    </div>
  );
}
