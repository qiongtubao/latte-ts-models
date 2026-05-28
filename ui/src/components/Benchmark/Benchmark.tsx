import React, { useEffect, useState } from 'react';
import { configApi, ConfigFile, ModelConfig } from '../../api/config';
import ModelSelector from './ModelSelector';
import SingleTestPanel from './SingleTestPanel';
import BatchTestPanel from './BatchTestPanel';
import QualityTestPanel from './QualityTestPanel';
import MetricsPanel from './MetricsPanel';
import StreamingOutput from './StreamingOutput';
import HistoryTable from './HistoryTable';

export interface ModelLimit {
  contextWindow: number;
  maxOutputTokens: number;
}

export default function Benchmark() {
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState('');
  const [config, setConfig] = useState<ConfigFile>({});
  const [metrics, setMetrics] = useState<any>(null);
  const [streamText, setStreamText] = useState('');
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([configApi.getGlobal(), configApi.getProject()]).then(([g, p]) => {
      setConfig({ providers: { ...g.providers, ...p.providers } });
    });
  }, []);

  // Extract model config from provider config
  const getModelLimit = (): ModelLimit => {
    const pc = config.providers?.[provider];
    if (!pc || !model) return { contextWindow: 131072, maxOutputTokens: 4096 };
    if (Array.isArray(pc.models)) return { contextWindow: 131072, maxOutputTokens: 4096 };
    const mc = (pc.models as Record<string, ModelConfig>)[model];
    if (!mc) return { contextWindow: 131072, maxOutputTokens: 4096 };
    return {
      contextWindow: mc.contextWindow || 131072,
      maxOutputTokens: mc.maxOutputTokens || 4096,
    };
  };

  const modelLimit = getModelLimit();

  const loadHistory = async () => {
    const res = await fetch('/api/benchmark/history');
    setHistory(await res.json());
  };

  return (
    <div>
      <h2>模型性能测试</h2>
      <ModelSelector provider={provider} model={model} onProviderChange={setProvider} onModelChange={setModel} />
      <SingleTestPanel
        provider={provider}
        model={model}
        limit={modelLimit}
        onStart={(m, t, s) => { setMetrics(m); setStreamText(t); setRunning(s); }}
      />
      <BatchTestPanel provider={provider} model={model} limit={modelLimit} />
      <QualityTestPanel provider={provider} model={model} limit={modelLimit} />
      {metrics && <MetricsPanel data={metrics} />}
      {streamText && <StreamingOutput text={streamText} />}
      <HistoryTable data={history} onRefresh={loadHistory} />
    </div>
  );
}
