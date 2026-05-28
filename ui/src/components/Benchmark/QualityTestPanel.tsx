import React, { useEffect, useState } from 'react';
import { ModelLimit } from './Benchmark';
import { configApi, ConfigFile } from '../../api/config';
import { runQualityTestSSE, QualityTestResult } from '../../api/quality';
import QualityResultsTable from './QualityResultsTable';

interface Props {
  provider: string;
  model: string;
  limit: ModelLimit;
}

type QualityScenario = 'needle_haystack' | 'long_summary' | 'cross_file_fix';

const SCENARIO_LABELS: Record<QualityScenario, string> = {
  needle_haystack: '信息检索 (Needle in Haystack)',
  long_summary: '长文档摘要 (Long Summary)',
  cross_file_fix: '跨文件代码修复 (Cross-file Fix)',
};

const SCENARIO_DIMENSIONS: Record<QualityScenario, string[]> = {
  needle_haystack: ['信息检索准确度'],
  long_summary: ['完整性', '准确性', '简洁性'],
  cross_file_fix: ['准确性', '代码质量'],
};

const WINDOW_OPTIONS = [
  { value: 4096, label: '4K' },
  { value: 8192, label: '8K' },
  { value: 16384, label: '16K' },
  { value: 32768, label: '32K' },
  { value: 65536, label: '64K' },
  { value: 131072, label: '128K' },
  { value: 262144, label: '256K' },
];

export default function QualityTestPanel({ provider, model, limit }: Props) {
  const [scenario, setScenario] = useState<QualityScenario>('needle_haystack');
  const [selectedSizes, setSelectedSizes] = useState<number[]>([4096, 16384, 65536]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ phase: string; current: number; total: number } | null>(null);
  const [streamText, setStreamText] = useState('');
  const [results, setResults] = useState<QualityTestResult[]>([]);
  const [judgeProvider, setJudgeProvider] = useState('');
  const [judgeModel, setJudgeModel] = useState('');
  const [config, setConfig] = useState<ConfigFile>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([configApi.getGlobal(), configApi.getProject()]).then(([g, p]) => {
      setConfig({ providers: { ...g.providers, ...p.providers } });
    });
  }, []);

  const judgeProviders = Object.keys(config.providers || {});
  const judgeModels: string[] = judgeProvider && config.providers?.[judgeProvider]
    ? (Array.isArray(config.providers[judgeProvider].models)
        ? config.providers[judgeProvider].models as string[]
        : Object.keys(config.providers[judgeProvider].models as object))
    : [];

  const toggleSize = (size: number) => {
    setSelectedSizes(prev =>
      prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size].sort((a, b) => a - b)
    );
  };

  const availableOptions = WINDOW_OPTIONS.filter(o => o.value <= limit.contextWindow);

  const handleStart = async () => {
    if (!model) { alert('请先选择模型'); return; }
    if (selectedSizes.length === 0) { alert('请至少选择一个窗口大小'); return; }
    if (!judgeProvider || !judgeModel) { alert('请选择评分模型'); return; }

    setRunning(true);
    setError(null);
    setResults([]);
    setStreamText('');
    setProgress(null);

    const allResults: QualityTestResult[] = [];

    try {
      await runQualityTestSSE(
        {
          provider,
          model,
          judgeModel: `${judgeProvider}/${judgeModel}`,
          scenario,
          windowSizes: selectedSizes,
        },
        (data) => {
          if (data.type === 'start') {
            setProgress({ phase: 'preparing', current: 0, total: data.totalTests });
          }
          if (data.type === 'progress') {
            setProgress({ phase: data.phase, current: data.current, total: data.total });
            setStreamText('');
          }
          if (data.type === 'text') {
            setStreamText(prev => prev + data.delta);
          }
          if (data.type === 'result') {
            allResults.push(data.result);
            setResults([...allResults]);
          }
          if (data.type === 'error') {
            setError(data.message);
          }
        }
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const phaseLabel: Record<string, string> = {
    preparing: '准备中',
    generating: '生成测试内容',
    asking: '模型回答中',
    judging: '评分中',
  };

  return (
    <div className="card">
      <h3>质量评估</h3>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
        在不同上下文窗口大小下，测试模型的回答质量。通过 AI 裁判自动评分，帮助找到模型的"最佳窗口"。
      </p>

      {!judgeProvider && (
        <div style={{ padding: '8px 12px', background: '#fff3e0', borderRadius: 4, marginBottom: 12, fontSize: 13 }}>
          提示：请选择评分模型，用于自动评估回答质量。
        </div>
      )}

      <div className="form-group">
        <label>评分模型 (Judge)</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <select value={judgeProvider} onChange={e => { setJudgeProvider(e.target.value); setJudgeModel(''); }} style={{ flex: 1, padding: '6px 8px' }}>
            <option value="">-- 选择 Provider --</option>
            {judgeProviders.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={judgeModel} onChange={e => setJudgeModel(e.target.value)} style={{ flex: 1, padding: '6px 8px' }}>
            <option value="">-- 选择 Model --</option>
            {judgeModels.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label>测试场景</label>
        <select value={scenario} onChange={e => setScenario(e.target.value as QualityScenario)} style={{ width: '100%', padding: '6px 8px', marginTop: 4 }}>
          {Object.entries(SCENARIO_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>窗口大小 (可多选)</label>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {availableOptions.map(o => (
            <label key={o.value} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', border: '1px solid #ddd', borderRadius: 4,
              background: selectedSizes.includes(o.value) ? '#e3f2fd' : '#fff',
              cursor: 'pointer', fontSize: 13,
            }}>
              <input
                type="checkbox"
                checked={selectedSizes.includes(o.value)}
                onChange={() => toggleSize(o.value)}
                disabled={running}
                style={{ margin: 0 }}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleStart} disabled={running}>
        {running ? '测试中...' : '开始质量测试'}
      </button>

      {progress && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#f0f7ff', borderRadius: 4, fontSize: 13 }}>
          <div style={{ marginBottom: 4 }}>
            {phaseLabel[progress.phase] || progress.phase} ({progress.current + 1}/{progress.total})
          </div>
          <div style={{ background: '#e0e0e0', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{
              background: '#1976d2', height: '100%', borderRadius: 4,
              width: `${progress.total > 0 ? ((progress.current + 1) / progress.total) * 100 : 0}%`,
              transition: 'width 0.3s',
            }} />
          </div>
          {streamText && (
            <pre style={{ marginTop: 8, fontSize: 12, color: '#555', whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto', background: '#fff', padding: 8, borderRadius: 4 }}>
              {streamText.slice(-500)}
            </pre>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#fce4ec', color: '#c62828', borderRadius: 4, fontSize: 13 }}>
          {error}
        </div>
      )}

      {results.length > 0 && (
        <QualityResultsTable results={results} dimensions={SCENARIO_DIMENSIONS[scenario]} />
      )}
    </div>
  );
}
