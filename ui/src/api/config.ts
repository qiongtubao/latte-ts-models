const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface ModelConfig {
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsToolUse?: boolean;
  useStream?: boolean;
  timeout?: number;
}

export interface ProviderConfig {
  baseURL: string;
  authType: 'apiKey' | 'authToken';
  authToken: string;
  protocol?: 'anthropic' | 'openai';
  models: string[] | Record<string, ModelConfig>;
  maxTokens?: number;
}

export interface ConfigFile {
  providers?: Record<string, ProviderConfig>;
  _judge?: JudgeConfig;
}

export interface JudgeConfig {
  provider: string;
  model: string;
  dimensions: string[];
}

export const configApi = {
  getGlobal: () => request<ConfigFile>('/config/global'),
  getProject: () => request<ConfigFile>('/config/project'),
  addGlobal: (name: string, provider: ProviderConfig) =>
    request('/config/global', { method: 'POST', body: JSON.stringify({ name, provider }) }),
  addProject: (name: string, provider: ProviderConfig) =>
    request('/config/project', { method: 'POST', body: JSON.stringify({ name, provider }) }),
  deleteGlobal: (name: string) => request(`/config/global/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  deleteProject: (name: string) => request(`/config/project/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  updateGlobal: (name: string, provider: ProviderConfig) =>
    request(`/config/global/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify({ provider }) }),
  updateProject: (name: string, provider: ProviderConfig) =>
    request(`/config/project/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify({ provider }) }),
  getJudge: () => request<JudgeConfig>('/config/judge'),
  setJudge: (judge: JudgeConfig) =>
    request('/config/judge', { method: 'PUT', body: JSON.stringify(judge) }),
};
