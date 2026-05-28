import React, { useState } from 'react';
import { ProviderConfig, ModelConfig } from '../../api/config';

interface Props {
  onAdd: (name: string, provider: ProviderConfig) => void;
  onClose: () => void;
}

interface ModelEntry {
  name: string;
  contextWindow: string;
  maxOutputTokens: string;
  supportsToolUse: boolean;
}

export default function AddProviderModal({ onAdd, onClose }: Props) {
  const [name, setName] = useState('');
  const [baseURL, setBaseURL] = useState('https://api.anthropic.com');
  const [authType, setAuthType] = useState<'apiKey' | 'authToken'>('apiKey');
  const [authToken, setAuthToken] = useState('');

  // Models: simple = comma-separated names, advanced = per-model config
  const [modelsMode, setModelsMode] = useState<'simple' | 'advanced'>('simple');
  const [modelsStr, setModelsStr] = useState('');
  const [modelEntries, setModelEntries] = useState<ModelEntry[]>([
    { name: '', contextWindow: '', maxOutputTokens: '', supportsToolUse: false },
  ]);

  const updateEntry = (i: number, field: keyof ModelEntry, value: string | boolean) => {
    setModelEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  };

  const addEntry = () => {
    setModelEntries(prev => [...prev, { name: '', contextWindow: '', maxOutputTokens: '', supportsToolUse: false }]);
  };

  const removeEntry = (i: number) => {
    setModelEntries(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = () => {
    if (!name || !authToken) return alert('请填写名称和 API Key');

    let models: string[] | Record<string, ModelConfig>;
    if (modelsMode === 'simple') {
      models = modelsStr.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      const obj: Record<string, ModelConfig> = {};
      for (const e of modelEntries) {
        if (!e.name.trim()) continue;
        const cfg: ModelConfig = {};
        if (e.contextWindow) cfg.contextWindow = Number(e.contextWindow);
        if (e.maxOutputTokens) cfg.maxOutputTokens = Number(e.maxOutputTokens);
        if (e.supportsToolUse) cfg.supportsToolUse = true;
        obj[e.name.trim()] = cfg;
      }
      models = obj;
    }

    onAdd(name, { baseURL, authType, authToken, models });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 560 }}>
        <h3>添加 Provider</h3>

        <div className="form-group">
          <label>Provider 名称</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="例如: anthropic" />
        </div>
        <div className="form-group">
          <label>Base URL</label>
          <input value={baseURL} onChange={e => setBaseURL(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Auth Type</label>
          <select value={authType} onChange={e => setAuthType(e.target.value as any)}>
            <option value="apiKey">apiKey</option>
            <option value="authToken">authToken</option>
          </select>
        </div>
        <div className="form-group">
          <label>API Key</label>
          <input type="password" value={authToken} onChange={e => setAuthToken(e.target.value)} />
        </div>

        <div className="form-group">
          <label>Models 模式</label>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button
              className={`tab ${modelsMode === 'simple' ? 'active' : ''}`}
              onClick={() => setModelsMode('simple')}
            >
              简单模式
            </button>
            <button
              className={`tab ${modelsMode === 'advanced' ? 'active' : ''}`}
              onClick={() => setModelsMode('advanced')}
            >
              高级模式
            </button>
          </div>
        </div>

        {modelsMode === 'simple' ? (
          <div className="form-group">
            <label>Model 名称（逗号分隔）</label>
            <input
              value={modelsStr}
              onChange={e => setModelsStr(e.target.value)}
              placeholder="claude-sonnet-4-20250514, claude-opus-4-20250514"
            />
          </div>
        ) : (
          <div>
            <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 8 }}>
              模型配置（含参数）
            </label>
            {modelEntries.map((e, i) => (
              <div key={i} className="card" style={{ padding: 12, marginBottom: 8, background: '#fafafa' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>模型名</label>
                    <input
                      placeholder="必填"
                      value={e.name}
                      onChange={ev => updateEntry(i, 'name', ev.target.value)}
                    />
                  </div>
                  {modelEntries.length > 1 && (
                    <button className="btn btn-sm btn-danger" onClick={() => removeEntry(i)} style={{ marginBottom: 2 }}>×</button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>上下文窗口</label>
                    <input
                      placeholder="例如: 128000"
                      value={e.contextWindow}
                      onChange={ev => updateEntry(i, 'contextWindow', ev.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>最大输出 Token</label>
                    <input
                      placeholder="例如: 4096"
                      value={e.maxOutputTokens}
                      onChange={ev => updateEntry(i, 'maxOutputTokens', ev.target.value)}
                    />
                  </div>
                </div>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={e.supportsToolUse}
                    onChange={ev => updateEntry(i, 'supportsToolUse', ev.target.checked)}
                  />
                  支持 Tool Use
                </label>
              </div>
            ))}
            <button className="btn btn-sm" onClick={addEntry} style={{ marginTop: 4 }}>
              + 添加模型
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={handleSubmit}>添加</button>
          <button className="btn" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
