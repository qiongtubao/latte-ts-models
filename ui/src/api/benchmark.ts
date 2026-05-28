export function runBenchmarkSSE(
  provider: string,
  model: string,
  inputTokens: number,
  maxOutputTokens: number,
  onEvent: (data: any) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    fetch('/api/benchmark/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, inputTokens, maxOutputTokens }),
      signal,
    }).then(async (res) => {
      if (!res.ok) { reject(new Error(`HTTP ${res.status}`)); return; }
      const reader = res.body?.getReader();
      if (!reader) { reject(new Error('No body')); return; }
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
