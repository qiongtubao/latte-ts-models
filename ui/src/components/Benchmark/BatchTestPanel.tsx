import React, { useState } from 'react';
import { ModelLimit } from './Benchmark';

interface Props {
  provider: string;
  model: string;
  limit: ModelLimit;
}

interface TestPoint {
  label: string;
  input: number;
  output: number;
  type: 'normal' | 'boundary' | 'extreme' | 'combo';
  group: 'input' | 'output' | 'combo';
}

function formatSize(tokens: number): string {
  if (tokens >= 1024) {
    return `${(tokens / 1024).toFixed(tokens % 1024 === 0 ? 0 : 1)}K`;
  }
  return `${tokens}`;
}

/** 分段动态步进生成测试序列：低负载翻倍 → 中负载大步 → 高负载小步 */
function generateSteppedSizes(
  start: number,
  promised: number,
  roundTo: number = 1024
): number[] {
  const sizes = new Set<number>();

  const lowEnd = Math.floor(promised * 0.25);    // 25% 分界：低→中
  const midEnd = Math.floor(promised * 0.75);    // 75% 分界：中→高
  const midStep = Math.floor(promised / 8);       // 中负载步进
  const highStep = Math.floor(promised / 16);     // 高负载步进

  // Zone 1: 翻倍 → 低负载区
  for (let s = start; s <= lowEnd; s *= 2) {
    sizes.add(s);
  }

  // Zone 2: 固定大步 → 中负载区
  for (let s = lowEnd + midStep; s <= midEnd; s += midStep) {
    sizes.add(Math.round(s / roundTo) * roundTo);
  }

  // Zone 3: 固定小步 → 高负载区（精确到边界前）
  for (let s = midEnd + highStep; s < promised; s += highStep) {
    const rounded = Math.round(s / roundTo) * roundTo;
    if (rounded < promised) sizes.add(rounded);
  }

  // 边界 + 越界
  sizes.add(promised);
  sizes.add(promised + 1);
  sizes.add(Math.floor(promised * 1.5));
  sizes.add(promised * 2);

  return [...sizes].sort((a, b) => a - b);
}

function generateTests(promisedCtx: number, promisedOut: number): TestPoint[] {
  const points: TestPoint[] = [];

  // ===== 输入窗口测试 =====
  const inputSizes = generateSteppedSizes(1024, promisedCtx, 1024);
  for (const s of inputSizes) {
    const label = formatSize(s);
    if (s === promisedCtx) {
      points.push({ label: `输入 ${label} (承诺边界)`, input: s, output: 100, type: 'boundary', group: 'input' });
    } else if (s === promisedCtx + 1) {
      points.push({ label: `输入 ${formatSize(promisedCtx)} + 1`, input: s, output: 100, type: 'extreme', group: 'input' });
    } else if (s < promisedCtx) {
      points.push({ label: `输入 ${label}`, input: s, output: 100, type: 'normal', group: 'input' });
    } else {
      points.push({ label: `输入 ${label} (${(s / promisedCtx).toFixed(1)}x)`, input: s, output: 100, type: 'extreme', group: 'input' });
    }
  }

  // ===== 输出窗口测试 =====
  const outputSizes = generateSteppedSizes(256, promisedOut, 256);
  for (const s of outputSizes) {
    const label = formatSize(s);
    if (s === promisedOut) {
      points.push({ label: `输出 ${label} (承诺边界)`, input: 100, output: s, type: 'boundary', group: 'output' });
    } else if (s === promisedOut + 1) {
      points.push({ label: `输出 ${formatSize(promisedOut)} + 1`, input: 100, output: s, type: 'extreme', group: 'output' });
    } else if (s < promisedOut) {
      points.push({ label: `输出 ${label}`, input: 100, output: s, type: 'normal', group: 'output' });
    } else {
      points.push({ label: `输出 ${label} (${(s / promisedOut).toFixed(1)}x)`, input: 100, output: s, type: 'extreme', group: 'output' });
    }
  }

  // ===== 组合测试：探测总窗口瓶颈 (input + output) =====
  const halfCtx = Math.floor(promisedCtx / 2);
  const quarterCtx = Math.floor(promisedCtx / 4);
  // 中等输入 + 中等输出，总合接近 50%
  points.push({ label: `总窗口 ~50% (${(quarterCtx/1024).toFixed(0)}K入+${(quarterCtx/1024).toFixed(0)}K出)`, input: quarterCtx, output: quarterCtx, type: 'combo', group: 'combo' });
  // 大输入 + 正常输出，总合接近 100%
  points.push({ label: `总窗口 ~100% (${(halfCtx/1024).toFixed(0)}K入+${(halfCtx/1024).toFixed(0)}K出)`, input: halfCtx, output: halfCtx, type: 'combo', group: 'combo' });
  // 总合略微超过承诺值
  points.push({ label: `总窗口 >100% (${(halfCtx/1024).toFixed(0)}K入+${(Math.floor(halfCtx*1.1)/1024).toFixed(0)}K出)`, input: halfCtx, output: Math.floor(halfCtx * 1.1), type: 'combo', group: 'combo' });
  // 极限组合：大输入 + 承诺输出，总合远超承诺值
  points.push({ label: `极限组合 (${(promisedCtx/1024).toFixed(0)}K入+${(promisedOut/1024).toFixed(0)}K出)`, input: promisedCtx, output: promisedOut, type: 'combo', group: 'combo' });

  return points;
}

export default function BatchTestPanel({ provider, model, limit }: Props) {
  const [running, setRunning] = useState(false);
  const [aborted, setAborted] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const promisedCtx = limit.contextWindow;
  const promisedOut = limit.maxOutputTokens;
  const allTests = generateTests(promisedCtx, promisedOut);

  const runOne = async (test: TestPoint): Promise<any> => {
    const res = await (await fetch('/api/benchmark/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, inputTokens: test.input, maxOutputTokens: test.output }),
    })).text();

    let result: any = {};
    for (const line of res.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          const d = JSON.parse(line.slice(6));
          if (d.type === 'done') result = d.result;
          if (d.type === 'error') result = { error: d.message };
        } catch {}
      }
    }
    return { ...test, ...result };
  };

  const handleRun = async () => {
    if (!model) { alert('请先选择模型'); return; }
    setRunning(true);
    setAborted(false);
    setResults([]);

    // 按 group 分组执行，每组独立的熔断计数器
    const groups = ['input', 'output', 'combo'] as const;
    const allResults: any[] = [];

    for (const group of groups) {
      const groupTests = allTests.filter(t => t.group === group);
      let groupErrors = 0;
      let boundaryTruncated = false;

      for (const test of groupTests) {
        if (aborted) break;

        // 如果同组内边界点已经截断/出错，跳过更极端的测试
        if (boundaryTruncated && test.type === 'extreme') {
          allResults.push({ ...test, status: 'skipped', label: test.label + ' (边界已截断，跳过)' });
          setResults([...allResults]);
          continue;
        }

        setResults([...allResults, { label: test.label, type: test.type, group: test.group, status: 'running' }]);

        try {
          const r = await runOne(test);
          allResults.push(r);
          setResults([...allResults]);

          // 判断是否需要触发跳过逻辑
          if (r.status === 'error' || r.error) {
            groupErrors++;
            if (groupErrors >= 2) {
              alert(`${group === 'input' ? '输入' : group === 'output' ? '输出' : '组合'}测试连续 2 次错误，该组已自动暂停`);
              break;
            }
          } else {
            groupErrors = 0;
          }

          // 边界点截断了 → 标记后续 extreme 跳过
          if ((test.type === 'boundary' || test.type === 'normal') && r.status === 'truncated') {
            boundaryTruncated = true;
          }
        } catch (e: any) {
          allResults.push({ ...test, error: e.message, status: 'error' });
          setResults([...allResults]);
          groupErrors++;
          if (groupErrors >= 2) break;
        }
      }
    }

    setRunning(false);
  };

  const typeColors: Record<string, string> = {
    normal: '#e8f5e9',
    boundary: '#fff3e0',
    extreme: '#fce4ec',
    combo: '#e3f2fd',
  };
  const typeLabels: Record<string, string> = {
    normal: '常规',
    boundary: '边界',
    extreme: '极限',
    combo: '组合',
  };
  const groupLabels: Record<string, string> = {
    input: '输入窗口',
    output: '输出窗口',
    combo: '总窗口瓶颈',
  };

  return (
    <div className="card">
      <h3>边界值批量测试</h3>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
        承诺上下文: <strong>{(promisedCtx / 1024).toFixed(0)}K</strong> | 承诺最大输出: <strong>{(promisedOut / 1024).toFixed(0)}K</strong>
        &nbsp;| 测试项: <strong>{allTests.length}</strong> (输入 {allTests.filter(t=>t.group==='input').length} + 输出 {allTests.filter(t=>t.group==='output').length} + 组合 {allTests.filter(t=>t.group==='combo').length})
      </p>
      <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 12, fontSize: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
              <th style={{ padding: '4px 8px' }}>#</th>
              <th style={{ padding: '4px 8px' }}>分组</th>
              <th style={{ padding: '4px 8px' }}>类别</th>
              <th style={{ padding: '4px 8px' }}>测试场景</th>
              <th style={{ padding: '4px 8px' }}>输入</th>
              <th style={{ padding: '4px 8px' }}>输出</th>
              <th style={{ padding: '4px 8px' }}>总合</th>
            </tr>
          </thead>
          <tbody>
            {allTests.map((t, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', background: typeColors[t.type] || 'transparent' }}>
                <td style={{ padding: '4px 8px' }}>{i + 1}</td>
                <td style={{ padding: '4px 8px', fontSize: 11, color: '#888' }}>{groupLabels[t.group]}</td>
                <td style={{ padding: '4px 8px' }}>{typeLabels[t.type]}</td>
                <td style={{ padding: '4px 8px' }}>{t.label}</td>
                <td style={{ padding: '4px 8px' }}>{t.input.toLocaleString()}</td>
                <td style={{ padding: '4px 8px' }}>{t.output.toLocaleString()}</td>
                <td style={{ padding: '4px 8px', fontWeight: t.group === 'combo' ? 600 : 400 }}>
                  {(t.input + t.output).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn-primary" onClick={handleRun} disabled={running}>
        {running ? '测试中...' : '开始批量测试'}
      </button>
      {running && <button className="btn btn-danger" onClick={() => setAborted(true)} style={{ marginLeft: 8 }}>急停</button>}

      {results.length > 0 && (
        <table style={{ width: '100%', marginTop: 16, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>分组</th><th style={{ padding: 8 }}>测试</th><th style={{ padding: 8 }}>总合</th><th style={{ padding: 8 }}>状态</th><th style={{ padding: 8 }}>TTFT</th><th style={{ padding: 8 }}>吞吐</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8, fontSize: 12, color: '#888' }}>{groupLabels[r.group] || '-'}</td>
                <td style={{ padding: 8 }}>{r.label}</td>
                <td style={{ padding: 8 }}>{(r.input + r.output)?.toLocaleString() || '-'}</td>
                <td style={{ padding: 8 }}>
                  {r.status === 'running' ? '⏳ 运行中...' :
                   r.status === 'skipped' ? '⏭️ 已跳过' :
                   r.status === 'normal' ? '✅ 正常' :
                   r.status === 'truncated' ? '⚠️ 截断' :
                   r.error ? '❌ 错误' : '...'}
                </td>
                <td style={{ padding: 8 }}>{r.ttftMs ? `${r.ttftMs}ms` : '-'}</td>
                <td style={{ padding: 8 }}>{r.tokensPerSec ? `${r.tokensPerSec}/s` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
