import React, { useState, useMemo, useEffect } from 'react';
import { ProviderConfig, ModelConfig, TestConnectionResult, configApi } from '../../api/config';

interface Props {
  name: string;
  provider: ProviderConfig;
  onSave: (p: ProviderConfig) => void;
  onDelete: () => void;
}

interface ModelEntry {
  name: string;
  contextWindow: string;
  maxOutputTokens: string;
  supportsToolUse: boolean;
}

function isObjModels(m: ProviderConfig['models']): m is Record<string, ModelConfig> {
  return m && !Array.isArray(m);
}

function modelsToEntries(m: ProviderConfig['models']): ModelEntry[] {
  if (isObjModels(m)) {
    return Object.entries(m).map(([name, cfg]) => ({
      name,
      contextWindow: cfg.contextWindow?.toString() || '',
      maxOutputTokens: cfg.maxOutputTokens?.toString() || '',
      supportsToolUse: cfg.supportsToolUse || false,
    }));
  }
  return [{ name: '', contextWindow: '', maxOutputTokens: '', supportsToolUse: false }];
}

export default function ProviderCard({ name, provider, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProviderConfig>({ ...provider });
  const [showKey, setShowKey] = useState(false);
  const [protocol, setProtocol] = useState<'anthropic' | 'openai'>(provider.protocol || 'anthropic');

  // Sync form when provider changes externally
  useEffect(() => {
    setForm({ ...provider });
    setProtocol(provider.protocol || 'anthropic');
  }, [provider]);

  const defaultMode = isObjModels(provider.models) ? 'advanced' : 'simple';
  const [modelsMode, setModelsMode] = useState<'simple' | 'advanced'>(defaultMode);
  const [modelsStr, setModelsStr] = useState(
    Array.isArray(provider.models) ? provider.models.join(', ') : ''
  );
  const [modelEntries, setModelEntries] = useState<ModelEntry[]>(modelsToEntries(provider.models));
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [fading, setFading] = useState(false);

  const updateEntry = (i: number, field: keyof ModelEntry, value: string | boolean) => {
    setModelEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  };

  const addEntry = () => {
    setModelEntries(prev => [...prev, { name: '', contextWindow: '', maxOutputTokens: '', supportsToolUse: false }]);
  };

  const removeEntry = (i: number) => {
    setModelEntries(prev => prev.filter((_, idx) => idx !== i));
  };

  const DIAGNOSIS_CN: Record<string, string> = {
    all_pass: '连接正常，可以开始使用',
    connectivity_or_auth_failed: '无法连接，请检查网络和 API Key 是否正确',
    rate_limited: '连接正常但触发频率限制，请稍后重试',
    content_policy_blocked: '连接正常但被内容安全策略拦截',
    client_layer_error: '网络和凭证正常，但内部处理异常，请联系技术支持',
  };

  const getTestModel = (): string => {
    if (modelsMode === 'simple') {
      const first = modelsStr.split(',').map(s => s.trim()).filter(Boolean)[0];
      return first || 'default';
    }
    const first = modelEntries.find(e => e.name.trim());
    return first?.name.trim() || 'default';
  };

  const handleTestConnection = async () => {
    const model = getTestModel();
    setTestState('testing');
    setTestResult(null);
    setFading(false);
    try {
      const result = await configApi.testConnection({
        baseUrl: form.baseURL,
        apiKey: form.authToken || '',
        protocol,
        model,
      });
      setTestResult(result);
      setTestState(result.success ? 'success' : 'error');
      if (result.success) {
        setTimeout(() => setFading(true), 3000);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        httpTest: { success: false, latencyMs: 0, error: err.message },
        clientTest: { success: false, latencyMs: 0, error: err.message },
        diagnosis: 'connectivity_or_auth_failed',
      });
      setTestState('error');
    }
  };

  const handleSave = () => {
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
    onSave({ ...form, models, protocol });
    setEditing(false);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{name}</h3>
        <div>
          <button className="btn btn-sm btn-primary" onClick={() => setEditing(!editing)} style={{ marginRight: 8 }}>
            {editing ? '取消' : '编辑'}
          </button>
          <button className="btn btn-sm btn-danger" onClick={onDelete}>删除</button>
        </div>
      </div>

      {editing ? (
        <>
          <div className="form-group">
            <label>Base URL</label>
            <input value={form.baseURL} onChange={e => setForm({ ...form, baseURL: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Auth Type</label>
            <select value={form.authType} onChange={e => setForm({ ...form, authType: e.target.value as any })}>
              <option value="apiKey">apiKey</option>
              <option value="authToken">authToken</option>
            </select>
          </div>
          <div className="form-group">
            <label>API Key / Token</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={form.authToken || ''}
                onChange={e => setForm({ ...form, authToken: e.target.value })}
              />
              <button className="btn btn-sm" onClick={() => setShowKey(!showKey)}>
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>协议</label>
            <select value={protocol} onChange={e => setProtocol(e.target.value as 'anthropic' | 'openai')}>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
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
              <input value={modelsStr} onChange={e => setModelsStr(e.target.value)} />
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

          <div className="test-connection-area">
            <button className="btn btn-primary" onClick={handleSave}>保存</button>
            <button
              className={`test-connection-btn ${testState === 'testing' ? 'testing' : ''}`}
              disabled={testState === 'testing' || !form.authToken}
              onClick={handleTestConnection}
            >
              {testState === 'testing' ? '测试中...' : '测试连接'}
            </button>
            {testResult && testState !== 'testing' && (
              <span className={`test-connection-result ${testResult.success ? 'success' : 'error'} ${fading ? 'fading' : ''}`}>
                {testResult.success
                  ? `连接正常 (${testResult.clientTest.latencyMs}ms)`
                  : DIAGNOSIS_CN[testResult.diagnosis] || testResult.diagnosis}
              </span>
            )}
          </div>
        </>
      ) : (
        <div>
          <p><strong>Base URL:</strong> {provider.baseURL}</p>
          <p><strong>Auth:</strong> {provider.authType} | Key: ****</p>
          <p>
            <strong>协议:</strong>{' '}
            <span style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              background: (provider.protocol || 'anthropic') === 'openai' ? '#e3f2fd' : '#f3e5f5',
              color: (provider.protocol || 'anthropic') === 'openai' ? '#1565c0' : '#7b1fa2',
            }}>
              {(provider.protocol || 'anthropic') === 'openai' ? 'OpenAI' : 'Anthropic'}
            </span>
          </p>
          <div>
            <strong>Models:</strong>
            {isObjModels(provider.models) ? (
              <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid #ddd' }}>模型名</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid #ddd' }}>上下文窗口</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid #ddd' }}>最大输出</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid #ddd' }}>Tool Use</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(provider.models).map(([m, cfg]) => (
                    <tr key={m}>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>{m}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>
                        {cfg.contextWindow?.toLocaleString() || '-'}
                      </td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>
                        {cfg.maxOutputTokens?.toLocaleString() || '-'}
                      </td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>
                        {cfg.supportsToolUse ? '✓' : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <span> {(provider.models as string[]).join(', ')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
