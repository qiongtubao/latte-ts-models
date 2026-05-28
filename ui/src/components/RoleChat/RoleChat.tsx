import React, { useState, useEffect } from 'react';
import RoleSelector from './RoleSelector';
import ChatPanel from './ChatPanel';
import ChatInput from './ChatInput';
import ReportPanel from './ReportPanel';
import { Role, fetchRoles, askSSE, autoScore, manualScore } from '../../api/chat';
import { configApi, JudgeConfig } from '../../api/config';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  sessionId?: string;
  autoScore?: any;
  manualScore?: any;
}

export default function RoleChat() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [model, setModel] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [autoScoreEnabled, setAutoScoreEnabled] = useState(true);
  const [judgeConfig, setJudgeConfig] = useState<JudgeConfig | null>(null);
  const [report, setReport] = useState<any>(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    fetchRoles().then(setRoles);
    configApi.getJudge().then(j => setJudgeConfig(j.provider ? j : null));
  }, []);

  const handleSend = async (question: string) => {
    if (!selectedRole || !model) { alert('请选择角色和模型'); return; }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: question };
    const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'ai', content: '', sessionId: '' };
    setMessages(prev => [...prev, userMsg, aiMsg]);
    setStreaming(true);

    let sessionId = '';
    try {
      await askSSE(selectedRole.id, model, question, (data) => {
        if (data.type === 'text') {
          setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: m.content + data.delta } : m));
        }
        if (data.type === 'done') {
          sessionId = data.sessionId;
          setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, sessionId } : m));
        }
      });

      if (autoScoreEnabled && judgeConfig && sessionId) {
        try {
          const scores = await autoScore(sessionId, `${judgeConfig.provider}/${judgeConfig.model}`, selectedRole.scoreDimensions);
          setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, autoScore: scores } : m));
        } catch {}
      }
    } catch (e: any) {
      setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: `[错误] ${e.message}` } : m));
    }
    setStreaming(false);
  };

  const handleManualScore = async (msgId: string, rating: number, tags: string[], comment: string) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg?.sessionId) return;
    await manualScore(msg.sessionId, rating, tags, comment);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, manualScore: { rating, tags, comment } } : m));
  };

  const handleShowReport = async () => {
    const res = await fetch('/api/chat/report');
    const data = await res.json();
    setReport(data);
    setShowReport(true);
  };

  return (
    <div>
      <h2>角色问答</h2>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <RoleSelector roles={roles} selected={selectedRole} onSelect={setSelectedRole} />
        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
          <label>模型</label>
          <input value={model} onChange={e => setModel(e.target.value)} placeholder="provider/model" />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
          <input type="checkbox" checked={autoScoreEnabled} onChange={e => setAutoScoreEnabled(e.target.checked)} />
          自动评分
        </label>
        <button className="btn btn-sm" onClick={handleShowReport}>查看报告</button>
      </div>
      <ChatPanel messages={messages} streaming={streaming} onManualScore={handleManualScore} />
      <ChatInput onSend={handleSend} disabled={streaming} />
      {showReport && report && <ReportPanel report={report} roles={roles} onClose={() => setShowReport(false)} />}
    </div>
  );
}
