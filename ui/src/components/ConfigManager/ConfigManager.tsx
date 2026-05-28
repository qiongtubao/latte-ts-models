import React, { useEffect, useState } from 'react';
import ConfigTabs from './ConfigTabs';
import ProviderCard from './ProviderCard';
import AddProviderModal from './AddProviderModal';
import JudgeModelConfig from './JudgeModelConfig';
import { configApi, ConfigFile, ProviderConfig } from '../../api/config';

export default function ConfigManager() {
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const [config, setConfig] = useState<ConfigFile>({});
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = scope === 'global' ? await configApi.getGlobal() : await configApi.getProject();
      setConfig(data);
    } catch (e: any) {
      alert('加载配置失败: ' + e.message);
    }
    setLoading(false);
  };

  useEffect(() => { loadConfig(); }, [scope]);

  const handleAdd = async (name: string, provider: ProviderConfig) => {
    if (scope === 'global') {
      await configApi.addGlobal(name, provider);
    } else {
      await configApi.addProject(name, provider);
    }
    setShowAdd(false);
    loadConfig();
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`确定要删除 Provider "${name}" 吗？`)) return;
    if (scope === 'global') {
      await configApi.deleteGlobal(name);
    } else {
      await configApi.deleteProject(name);
    }
    loadConfig();
  };

  const handleSave = async (name: string, provider: ProviderConfig) => {
    if (scope === 'global') {
      await configApi.updateGlobal(name, provider);
    } else {
      await configApi.updateProject(name, provider);
    }
    loadConfig();
  };

  if (loading) return <div className="card">加载中...</div>;

  const providers = config.providers || {};

  return (
    <div>
      <h2>配置管理</h2>
      <ConfigTabs scope={scope} onChange={setScope} />
      {Object.entries(providers).map(([name, provider]) => (
        <ProviderCard
          key={name}
          name={name}
          provider={provider}
          onSave={(p) => handleSave(name, p)}
          onDelete={() => handleDelete(name)}
        />
      ))}
      <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ marginRight: 8 }}>
        + 添加 Provider
      </button>
      {scope === 'project' && <JudgeModelConfig />}
      {showAdd && (
        <AddProviderModal
          onAdd={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
