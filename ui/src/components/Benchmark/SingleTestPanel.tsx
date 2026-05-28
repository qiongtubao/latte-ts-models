import React, { useState } from 'react';
import TokenWarning from './TokenWarning';
import { ModelLimit } from './Benchmark';
import { INPUT_PRESETS, OUTPUT_PRESETS } from './modelLimits';
import { runBenchmarkSSE } from '../../api/benchmark';

interface Props {
  provider: string;
  model: string;
  limit: ModelLimit;
  onStart: (metrics: any, text: string, running: boolean) => void;
}

export default function SingleTestPanel({ provider, model, limit, onStart }: Props) {
  const [inputTokens, setInputTokens] = useState(Math.min(8192, limit.contextWindow));
  const [outputTokens, setOutputTokens] = useState(Math.min(2048, limit.maxOutputTokens));
  const [running, setRunning] = useState(false);

  const handleStart = async () => {
    if (!model) { alert('请先选择模型'); return; }
    setRunning(true);
    onStart(null, '', true);

    let ttft = 0;
    let total = 0;
    let tps = 0;
    let streamText = '';
    let firstText = true;

    try {
      await runBenchmarkSSE(provider, model, inputTokens, outputTokens, (data) => {
        if (data.type === 'text') {
          streamText += data.delta;
          onStart(null, streamText, true);
        }
        if (data.type === 'ttft') ttft = data.ms;
        if (data.type === 'done' && data.result) {
          total = data.result.totalMs;
          tps = data.result.tokensPerSec;
        }
      });
      onStart({ ttftMs: ttft, totalMs: total, tokensPerSec: tps, model, inputTokens, outputTokens }, streamText, false);
    } catch (e: any) {
      onStart({ error: e.message }, '', false);
    }
    setRunning(false);
  };

  return (
    <div className="card">
      <h3>单次测试</h3>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
        上下文窗口: {(limit.contextWindow / 1024).toFixed(0)}K | 最大输出: {(limit.maxOutputTokens / 1024).toFixed(0)}K
        {limit.contextWindow ? '' : ' (默认值)'}
      </p>
      <div className="form-group">
        <label>输入大小 (tokens): {inputTokens.toLocaleString()}</label>
        <input type="range" min={512} max={limit.contextWindow + 1000} value={inputTokens} onChange={e => setInputTokens(Number(e.target.value))} />
        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
          {INPUT_PRESETS.filter(p => p <= limit.contextWindow + 1000).map(p => (
            <button key={p} className={`btn btn-sm ${inputTokens === p ? 'btn-primary' : ''}`} onClick={() => setInputTokens(p)}>
              {p >= 1024 ? `${p / 1024}K` : p}
            </button>
          ))}
          <button className="btn btn-sm" onClick={() => { const v = prompt('自定义输入大小 (tokens):'); if (v) setInputTokens(Number(v)); }}>自定义</button>
        </div>
      </div>
      <div className="form-group">
        <label>期望输出 (tokens): {outputTokens.toLocaleString()}</label>
        <input type="range" min={64} max={limit.maxOutputTokens + 100} value={outputTokens} onChange={e => setOutputTokens(Number(e.target.value))} />
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {OUTPUT_PRESETS.map(p => (
            <button key={p} className={`btn btn-sm ${outputTokens === p ? 'btn-primary' : ''}`} onClick={() => setOutputTokens(p)}>
              {p >= 1024 ? `${p / 1024}K` : p}
            </button>
          ))}
          <button className="btn btn-sm" onClick={() => setOutputTokens(limit.maxOutputTokens)}>Max</button>
          <button className="btn btn-sm" onClick={() => { const v = prompt('自定义输出大小 (tokens):'); if (v) setOutputTokens(Number(v)); }}>自定义</button>
        </div>
      </div>
      <TokenWarning inputTokens={inputTokens} outputTokens={outputTokens} contextWindow={limit.contextWindow} />
      <button className="btn btn-primary" onClick={handleStart} disabled={running}>
        {running ? '测试中...' : '开始测试'}
      </button>
    </div>
  );
}
