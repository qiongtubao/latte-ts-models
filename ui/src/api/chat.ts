export interface Role {
  id: string;
  name: string;
  systemPrompt: string;
  scoreDimensions: string[];
}

export async function fetchRoles(): Promise<Role[]> {
  const res = await fetch('/api/chat/roles');
  return res.json();
}

export function askSSE(roleId: string, model: string, question: string, onEvent: (data: any) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    fetch('/api/chat/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId, model, question }),
      signal,
    }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try { onEvent(JSON.parse(line.slice(6))); } catch {}
          }
        }
      }
      resolve();
    }).catch(reject);
  });
}

export async function autoScore(sessionId: string, judgeModel: string, dimensions: string[]): Promise<any> {
  const res = await fetch('/api/chat/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, judgeModel, dimensions }),
  });
  return res.json();
}

export async function manualScore(sessionId: string, rating: number, tags: string[], comment: string): Promise<void> {
  await fetch('/api/chat/score/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, rating, tags, comment }),
  });
}

export async function fetchSessions(): Promise<any[]> {
  const res = await fetch('/api/chat/sessions');
  return res.json();
}

export async function fetchReport(): Promise<any> {
  const res = await fetch('/api/chat/report');
  return res.json();
}
