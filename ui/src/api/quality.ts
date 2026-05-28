export interface QualityTestConfig {
  provider: string;
  model: string;
  judgeModel: string;
  scenario: 'needle_haystack' | 'long_summary' | 'cross_file_fix';
  windowSizes: number[];
}

export interface QualityTestResult {
  scenario: string;
  windowSize: number;
  scores: Record<string, number>;
  comment?: string;
  modelAnswer?: string;
  status: 'success' | 'error';
  errorMessage?: string;
}

export async function runQualityTestSSE(
  config: QualityTestConfig,
  onEvent: (data: any) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch('/api/quality/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

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
        try {
          const data = JSON.parse(line.slice(6));
          onEvent(data);
        } catch {}
      }
    }
  }
}

export async function getQualityHistory(): Promise<any[]> {
  const res = await fetch('/api/quality/history');
  return res.json();
}
