import { ProviderConfig } from '../src/types/types';
import { AnthropicAdapter } from '../src/adapters/AnthropicAdapter';
import { OpenAIAdapter } from '../src/adapters/OpenAIAdapter';
import { IChatAdapter } from '../src/adapters/IChatAdapter';

// ---- Types ----

export interface TestConnectionInput {
  baseUrl: string;
  apiKey: string;
  protocol: 'anthropic' | 'openai';
  model: string;
}

export interface LayerTestResult {
  success: boolean;
  latencyMs: number;
  error?: string;
  statusCode?: number;
}

export interface TestConnectionResult {
  success: boolean;
  httpTest: LayerTestResult;
  clientTest: LayerTestResult;
  diagnosis: DiagnosisCode;
}

export type DiagnosisCode =
  | 'all_pass'
  | 'connectivity_or_auth_failed'
  | 'rate_limited'
  | 'content_policy_blocked'
  | 'client_layer_error';

// ---- Helpers ----

function getChatEndpoint(baseUrl: string, protocol: 'anthropic' | 'openai'): string {
  const base = baseUrl.replace(/\/$/, '');
  if (protocol === 'anthropic') {
    return `${base}/v1/messages`;
  }
  return `${base}/v1/chat/completions`;
}

function buildHttpRequestBody(model: string): string {
  return JSON.stringify({
    model,
    max_tokens: 1,
    messages: [{ role: 'user', content: 'Hi' }],
  });
}

function getAuthHeader(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
}

function getAnthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
}

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ETIMEDOUT')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// ---- HTTP Layer Test ----

async function runHttpTest(input: TestConnectionInput): Promise<LayerTestResult> {
  const started = Date.now();
  const endpoint = getChatEndpoint(input.baseUrl, input.protocol);
  const body = buildHttpRequestBody(input.model);
  const headers = input.protocol === 'anthropic'
    ? getAnthropicHeaders(input.apiKey)
    : getAuthHeader(input.apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - started;

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return {
        success: false,
        latencyMs,
        error: `${response.status} ${response.statusText}${errorText ? ' - ' + errorText.slice(0, 200) : ''}`,
        statusCode: response.status,
      };
    }

    return { success: true, latencyMs };
  } catch (err: any) {
    clearTimeout(timer);
    return {
      success: false,
      latencyMs: Date.now() - started,
      error: err.name === 'AbortError' || err.message === 'ETIMEDOUT'
        ? '请求超时（10s）'
        : err.message,
    };
  }
}

// ---- AIClient Layer Test ----

async function runClientTest(input: TestConnectionInput): Promise<LayerTestResult> {
  const started = Date.now();
  const providerConfig: ProviderConfig = {
    baseURL: input.baseUrl,
    authType: 'apiKey',
    authToken: input.apiKey,
    protocol: input.protocol,
    models: [input.model],
  };

  try {
    const adapter: IChatAdapter = input.protocol === 'openai'
      ? new OpenAIAdapter(providerConfig)
      : new AnthropicAdapter(providerConfig);

    await timeout(
      adapter.chat([{ role: 'user', content: 'Hi' }], { model: input.model, maxTokens: 1 }),
      10_000
    );

    return { success: true, latencyMs: Date.now() - started };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    const message: string = err?.message || String(err);

    // Extract status code from error message patterns
    let statusCode: number | undefined;
    const statusMatch = message.match(/(\d{3})\s/);
    if (statusMatch) {
      statusCode = parseInt(statusMatch[1], 10);
    }
    if (message.includes('429')) statusCode = 429;
    if (message.includes('403')) statusCode = 403;
    if (message.includes('401')) statusCode = 401;
    if (message.includes('ETIMEDOUT')) statusCode = undefined;

    return {
      success: false,
      latencyMs,
      error: message.slice(0, 300),
      statusCode,
    };
  }
}

// ---- Diagnosis ----

function diagnose(httpTest: LayerTestResult, clientTest: LayerTestResult): DiagnosisCode {
  if (httpTest.success && clientTest.success) {
    return 'all_pass';
  }
  if (!httpTest.success && !clientTest.success) {
    return 'connectivity_or_auth_failed';
  }
  // http passed, client failed — check status code
  if (httpTest.success && !clientTest.success) {
    if (clientTest.statusCode === 429) return 'rate_limited';
    if (clientTest.statusCode === 403) return 'content_policy_blocked';
    return 'client_layer_error';
  }
  // http failed, client succeeded (should be rare; treat as client_layer_error)
  return 'client_layer_error';
}

// ---- Main Export ----

export async function testConnection(input: TestConnectionInput): Promise<TestConnectionResult> {
  const [httpTest, clientTest] = await Promise.all([
    runHttpTest(input),
    runClientTest(input),
  ]);
  const diagnosis = diagnose(httpTest, clientTest);

  return {
    success: httpTest.success && clientTest.success,
    httpTest,
    clientTest,
    diagnosis,
  };
}
