export interface ModelLimit {
  contextWindow: number;
  maxOutputTokens: number;
}

export const MODEL_LIMITS: Record<string, ModelLimit> = {
  'gpt-3.5-turbo': { contextWindow: 16384, maxOutputTokens: 4096 },
  'gpt-4': { contextWindow: 131072, maxOutputTokens: 4096 },
  'gpt-4o': { contextWindow: 131072, maxOutputTokens: 16384 },
  'claude-3-5-sonnet': { contextWindow: 200000, maxOutputTokens: 8192 },
  'claude-3-opus': { contextWindow: 200000, maxOutputTokens: 4096 },
  'claude-sonnet-4-20250514': { contextWindow: 200000, maxOutputTokens: 8192 },
  'claude-opus-4-20250514': { contextWindow: 200000, maxOutputTokens: 8192 },
  'gemini-1.5-pro': { contextWindow: 1000000, maxOutputTokens: 8192 },
  'gemini-1.5-flash': { contextWindow: 1000000, maxOutputTokens: 8192 },
};

export const INPUT_PRESETS = [4096, 8192, 32768, 65536, 131072, 200000];
export const OUTPUT_PRESETS = [2048, 4096, 8192, 16384];

export function findModelLimit(model: string): ModelLimit {
  for (const [key, limit] of Object.entries(MODEL_LIMITS)) {
    if (model.toLowerCase().includes(key.toLowerCase())) return limit;
  }
  return { contextWindow: 131072, maxOutputTokens: 4096 };
}
