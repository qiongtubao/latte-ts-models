import { AIClient } from '../src/core/ai-client';

export interface BenchmarkResult {
  model: string;
  inputTokens: number;
  outputTokens: number;
  ttftMs: number;
  totalMs: number;
  tokensPerSec: number;
  tokenTimings: number[];
  status: 'normal' | 'truncated' | 'error';
  errorMessage?: string;
}

export async function runBenchmark(
  client: AIClient,
  model: string,
  inputTokens: number,
  maxOutputTokens: number,
  onStream?: (chunk: string) => void
): Promise<BenchmarkResult> {
  const prompt = generatePrompt(inputTokens);

  const startTime = performance.now();
  let firstTokenTime = 0;
  let firstTokenRecorded = false;
  const tokenTimings: number[] = [];
  let lastTokenTime = startTime;
  let streamedText = '';

  try {
    const response = await client.chatStream(
      [{ role: 'user', content: prompt }],
      { model, maxTokens: maxOutputTokens },
      (event) => {
        if (event.type === 'text') {
          const now = performance.now();
          if (!firstTokenRecorded) {
            firstTokenTime = now;
            firstTokenRecorded = true;
          }
          tokenTimings.push(now - lastTokenTime);
          lastTokenTime = now;
          streamedText += event.delta;
          onStream?.(event.delta);
        }
      }
    );

    const endTime = performance.now();
    const totalMs = endTime - startTime;
    const ttftMs = firstTokenTime - startTime;
    const outputTokens = response.usage?.outputTokens || 0;

    return {
      model,
      inputTokens,
      outputTokens,
      ttftMs: Math.round(ttftMs),
      totalMs: Math.round(totalMs),
      tokensPerSec: totalMs > 0 ? Math.round((outputTokens / (totalMs / 1000)) * 10) / 10 : 0,
      tokenTimings,
      status: response.stopReason === 'max_tokens' ? 'truncated' : 'normal',
    };
  } catch (error: any) {
    return {
      model,
      inputTokens,
      outputTokens: 0,
      ttftMs: 0,
      totalMs: 0,
      tokensPerSec: 0,
      tokenTimings: [],
      status: 'error',
      errorMessage: error.message,
    };
  }
}

function generatePrompt(targetTokens: number): string {
  const template = '请详细分析以下文本的内容、结构和语义特征，并从多角度进行深度解读：\n\n';
  const filler = '人工智能技术正在快速发展，深刻地改变着人类社会的各个方面。';
  const repeats = Math.ceil(targetTokens / 10);
  return template + filler.repeat(repeats).slice(0, targetTokens * 3);
}
