import React from 'react';

interface Props {
  scope: 'global' | 'project';
  onChange: (s: 'global' | 'project') => void;
}

export default function ConfigTabs({ scope, onChange }: Props) {
  return (
    <div className="tabs">
      <button className={`tab ${scope === 'global' ? 'active' : ''}`} onClick={() => onChange('global')}>
        全局配置
      </button>
      <button className={`tab ${scope === 'project' ? 'active' : ''}`} onClick={() => onChange('project')}>
        本项目配置
      </button>
    </div>
  );
}
