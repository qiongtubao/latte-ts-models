import React from 'react';
import { Role } from '../../api/chat';

interface Props {
  roles: Role[];
  selected: Role | null;
  onSelect: (r: Role) => void;
}

export default function RoleSelector({ roles, selected, onSelect }: Props) {
  return (
    <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
      <label>角色</label>
      <select value={selected?.id || ''} onChange={e => { const r = roles.find(rr => rr.id === e.target.value); if (r) onSelect(r); }}>
        <option value="">-- 选择角色 --</option>
        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </div>
  );
}
