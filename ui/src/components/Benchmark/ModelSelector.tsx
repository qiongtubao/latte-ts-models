import React, { useEffect, useState } from 'react';
import { configApi, ConfigFile } from '../../api/config';

interface Props {
  provider: string;
  model: string;
  onProviderChange: (p: string) => void;
  onModelChange: (m: string) => void;
}

export default function ModelSelector({ provider, model, onProviderChange, onModelChange }: Props) {
  const [config, setConfig] = useState<ConfigFile>({});

  useEffect(() => {
    Promise.all([configApi.getGlobal(), configApi.getProject()]).then(([g, p]) => {
      setConfig({ providers: { ...g.providers, ...p.providers } });
    });
  }, []);

  const providers = Object.keys(config.providers || {});
  const models: string[] = provider && config.providers?.[provider]
    ? (Array.isArray(config.providers[provider].models)
        ? config.providers[provider].models as string[]
        : Object.keys(config.providers[provider].models as object))
    : [];

  return (
    <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
        <label>Provider</label>
        <select value={provider} onChange={e => onProviderChange(e.target.value)}>
          <option value="">-- 选择 --</option>
          {providers.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
        <label>Model</label>
        <select value={model} onChange={e => onModelChange(e.target.value)}>
          <option value="">-- 选择 --</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
    </div>
  );
}
