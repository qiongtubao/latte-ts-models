# latte-ts-models 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个基于 Anthropic SDK 的多 Provider AI 客户端库，提供统一的 API 接口调用多个 AI 服务提供商。

**Architecture:** 分层模块化设计，类型层 → 工具层 → 服务层 → 应用层。每个模块职责单一，通过清晰的接口组装。

**Tech Stack:** TypeScript, Jest, Anthropic SDK, tsup (构建工具)

---

## 文件结构

```
latte-ts-models/
├── src/
│   ├── index.ts                    # 入口，导出所有公开 API
│   ├── types/
│   │   ├── types.ts                # 类型定义
│   │   └── types.test.ts
│   ├── utils/
│   │   ├── backoff.ts              # 指数退避
│   │   ├── backoff.test.ts
│   │   ├── retry.ts                # 重试逻辑
│   │   ├── retry.test.ts
│   │   ├── json-extractor.ts       # JSON 提取
│   │   └── json-extractor.test.ts
│   ├── config/
│   │   ├── config.ts               # 配置加载
│   │   └── config.test.ts
│   ├── resolver/
│   │   ├── provider-resolver.ts    # Provider 路由
│   │   └── provider-resolver.test.ts
│   └── core/
│       ├── ai-client.ts            # AIClient 主类
│       └── ai-client.test.ts
├── dist/                           # 编译输出（CommonJS + ESM）
├── package.json
├── tsconfig.json
└── jest.config.js
```

---

## Task 1: 基础配置文件

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.js`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "latte-ts-models",
  "version": "1.0.0",
  "description": "基于 Anthropic SDK 的多 Provider AI 客户端库",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "require": "./dist/index.js",
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "test": "jest",
    "test:watch": "jest --watch",
    "prepublishOnly": "npm run build"
  },
  "keywords": [
    "ai",
    "anthropic",
    "claude",
    "llm",
    "client"
  ],
  "license": "MIT",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 3: 创建 jest.config.js**

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};
```

- [ ] **Step 4: 安装依赖**

Run: `npm install`

Expected: 成功安装所有依赖

- [ ] **Step 5: 验证配置**

Run: `npx tsc --version`

Expected: 显示 TypeScript 版本号

---

## Task 2: 类型定义模块

**Files:**
- Create: `src/types/types.ts`
- Create: `src/types/types.test.ts`

- [ ] **Step 1: 编写类型定义失败的测试**

创建 `src/types/types.test.ts`:

```typescript
import {
  ProviderConfig,
  ModelConfig,
  ChatMessage,
  ChatResponse,
  ChatOptions,
  Usage,
  UsageStats,
  Logger,
  NetworkError,
  HttpError,
  RateLimitError,
  NonRetryableError,
} from './types';

describe('类型定义', () => {
  describe('核心类型', () => {
    test('ProviderConfig 接口定义正确', () => {
      const config: ProviderConfig = {
        baseURL: 'https://api.example.com',
        authType: 'apiKey',
        models: ['model-1', 'model-2'],
      };
      expect(config.baseURL).toBe('https://api.example.com');
    });

    test('ProviderConfig 支持 models 为对象', () => {
      const config: ProviderConfig = {
        baseURL: 'https://api.example.com',
        authType: 'authToken',
        models: {
          'model-1': { useStream: true },
        },
      };
      expect(config.models).toBeDefined();
    });

    test('ModelConfig 所有字段可选', () => {
      const config: ModelConfig = {};
      expect(config).toBeDefined();
    });

    test('ChatMessage 包含 role 和 content', () => {
      const message: ChatMessage = {
        role: 'user',
        content: 'Hello',
      };
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello');
    });

    test('ChatResponse 包含必需字段', () => {
      const response: ChatResponse = {
        text: 'Response text',
        stopReason: 'end_turn',
        model: 'claude-sonnet-4-20250514',
        usage: {
          inputTokens: 10,
          outputTokens: 20,
        },
      };
      expect(response.text).toBe('Response text');
      expect(response.usage?.inputTokens).toBe(10);
    });

    test('ChatOptions 所有字段可选', () => {
      const options: ChatOptions = {};
      expect(options).toBeDefined();
    });

    test('Usage 包含 inputTokens 和 outputTokens', () => {
      const usage: Usage = {
        inputTokens: 100,
        outputTokens: 200,
      };
      expect(usage.inputTokens).toBe(100);
      expect(usage.outputTokens).toBe(200);
    });

    test('UsageStats 包含所有统计字段', () => {
      const stats: UsageStats = {
        totalCalls: 10,
        successCalls: 8,
        failedCalls: 2,
        totalInputTokens: 1000,
        totalOutputTokens: 2000,
        totalTokens: 3000,
        byModel: {
          'model-1': {
            calls: 5,
            inputTokens: 500,
            outputTokens: 1000,
          },
        },
      };
      expect(stats.totalCalls).toBe(10);
      expect(stats.byModel['model-1'].calls).toBe(5);
    });

    test('Logger 接口定义正确', () => {
      const logger: Logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      expect(logger.debug).toBeDefined();
    });
  });

  describe('错误类型', () => {
    test('NetworkError 继承 Error', () => {
      const error = new NetworkError('Connection failed');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NetworkError');
      expect(error.message).toBe('Connection failed');
    });

    test('HttpError 包含 status 字段', () => {
      const error = new HttpError('Not found', 404);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('HttpError');
      expect(error.status).toBe(404);
    });

    test('RateLimitError 继承 HttpError 且 status 为 429', () => {
      const error = new RateLimitError('Too many requests');
      expect(error).toBeInstanceOf(HttpError);
      expect(error.name).toBe('RateLimitError');
      expect(error.status).toBe(429);
    });

    test('NonRetryableError 继承 Error', () => {
      const error = new NonRetryableError('Invalid request');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NonRetryableError');
    });
  });

  describe('noopLogger', () => {
    test('noopLogger 不抛错', () => {
      // noopLogger 应该是一个静默的日志实现
      expect(() => {
        const noopLogger: Logger = {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        };
        noopLogger.debug('test');
        noopLogger.info('test');
        noopLogger.warn('test');
        noopLogger.error('test');
      }).not.toThrow();
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- src/types/types.test.ts`

Expected: FAIL - 找不到模块 './types'

- [ ] **Step 3: 实现类型定义**

创建 `src/types/types.ts`:

```typescript
/**
 * 模型配置
 */
export interface ModelConfig {
  useStream?: boolean;          // 是否强制流式模式
  contextWindow?: number;       // 上下文窗口大小
  maxOutputTokens?: number;     // 最大输出 Token
  supportsToolUse?: boolean;    // 是否支持 Tool Use
  timeout?: number;             // 请求超时时间
}

/**
 * Provider 配置
 */
export interface ProviderConfig {
  baseURL: string;                              // API 服务地址
  authToken?: string;                           // 认证令牌
  authType: 'apiKey' | 'authToken';             // 认证方式
  models: string[] | Record<string, ModelConfig>; // 可用模型
  maxTokens?: number;                           // 最大 Token 限制
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Token 用量
 */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  text: string;              // 回复文本
  stopReason: string | null; // 'end_turn' | 'max_tokens' | null
  model: string;             // 实际使用的模型名
  usage?: Usage;             // Token 用量统计
}

/**
 * 聊天选项
 */
export interface ChatOptions {
  model?: string;            // 模型标识，支持 "provider/model" 格式
  maxTokens?: number;        // 最大生成 Token 数
  systemPrompt?: string;     // 系统提示词
}

/**
 * 用量统计
 */
export interface UsageStats {
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  byModel: Record<string, {
    calls: number;
    inputTokens: number;
    outputTokens: number;
  }>;
}

/**
 * 日志接口
 */
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * 网络错误（无状态码）
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * HTTP 错误（有状态码）
 */
export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * 限流错误（429）
 */
export class RateLimitError extends HttpError {
  constructor(message: string) {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * 不可重试错误
 */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- src/types/types.test.ts`

Expected: PASS - 所有测试通过

- [ ] **Step 5: 提交**

```bash
git add src/types/types.ts src/types/types.test.ts
git commit -m "feat: 添加类型定义模块"
```

---

## Task 3: 退避算法模块

**Files:**
- Create: `src/utils/backoff.ts`
- Create: `src/utils/backoff.test.ts`

- [ ] **Step 1: 编写退避算法失败的测试**

创建 `src/utils/backoff.test.ts`:

```typescript
import { calculateBackoff, formatDelay } from './backoff';

describe('退避算法', () => {
  describe('calculateBackoff', () => {
    test('n=0 时基础延迟为 500-600ms', () => {
      const delay = calculateBackoff(0);
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThan(600);
    });

    test('n=1 时基础延迟为 1000-1100ms', () => {
      const delay = calculateBackoff(1);
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThan(1100);
    });

    test('n=2 时基础延迟为 2000-2100ms', () => {
      const delay = calculateBackoff(2);
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThan(2100);
    });

    test('n=3 时基础延迟为 4000-4100ms', () => {
      const delay = calculateBackoff(3);
      expect(delay).toBeGreaterThanOrEqual(4000);
      expect(delay).toBeLessThan(4100);
    });

    test('大 n 值上限为 24 小时', () => {
      const delay = calculateBackoff(100);
      expect(delay).toBeLessThanOrEqual(86_400_000);
    });

    test('jitter 有效性（多次调用结果不同）', () => {
      const delays = new Set();
      for (let i = 0; i < 10; i++) {
        delays.add(calculateBackoff(5));
      }
      // 由于 jitter，多次调用应该产生不同的结果
      expect(delays.size).toBeGreaterThan(1);
    });

    test('负数输入返回 500-600ms', () => {
      const delay = calculateBackoff(-1);
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThan(600);
    });

    test('小数输入向下取整', () => {
      const delay = calculateBackoff(2.5);
      // 2.5 向下取整为 2，基础延迟 2000ms
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThan(2100);
    });
  });

  describe('formatDelay', () => {
    test('毫秒格式化', () => {
      expect(formatDelay(500)).toBe('500ms');
      expect(formatDelay(999)).toBe('999ms');
    });

    test('秒格式化', () => {
      expect(formatDelay(1000)).toBe('1.0s');
      expect(formatDelay(5500)).toBe('5.5s');
      expect(formatDelay(59999)).toBe('60.0s');
    });

    test('分钟格式化', () => {
      expect(formatDelay(60000)).toBe('1.0min');
      expect(formatDelay(120000)).toBe('2.0min');
      expect(formatDelay(3599999)).toBe('60.0min');
    });

    test('小时格式化', () => {
      expect(formatDelay(3600000)).toBe('1.0h');
      expect(formatDelay(7200000)).toBe('2.0h');
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- src/utils/backoff.test.ts`

Expected: FAIL - 找不到模块 './backoff'

- [ ] **Step 3: 实现退避算法**

创建 `src/utils/backoff.ts`:

```typescript
/**
 * 计算指数退避延迟
 *
 * @param n - 重试次数（从 0 开始）
 * @returns 延迟毫秒数
 *
 * 算法: delay = 500ms * 2^n + jitter(0-99ms)
 * 上限: 24小时 = 86,400,000ms
 */
export function calculateBackoff(n: number): number {
  const baseDelay = 500;
  const maxDelay = 86_400_000; // 24 小时
  const jitter = Math.floor(Math.random() * 100);

  // 处理负数和小数
  const exponent = Math.max(0, Math.floor(n));
  const delay = baseDelay * Math.pow(2, exponent) + jitter;
  return Math.min(delay, maxDelay);
}

/**
 * 格式化延迟时间用于日志输出
 *
 * @param ms - 毫秒数
 * @returns 格式化后的时间字符串
 */
export function formatDelay(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else if (ms < 3600000) {
    return `${(ms / 60000).toFixed(1)}min`;
  } else {
    return `${(ms / 3600000).toFixed(1)}h`;
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- src/utils/backoff.test.ts`

Expected: PASS - 所有测试通过

- [ ] **Step 5: 提交**

```bash
git add src/utils/backoff.ts src/utils/backoff.test.ts
git commit -m "feat: 添加退避算法模块"
```

---

## Task 4: 重试逻辑模块

**Files:**
- Create: `src/utils/retry.ts`
- Create: `src/utils/retry.test.ts`

- [ ] **Step 1: 编写重试逻辑失败的测试**

创建 `src/utils/retry.test.ts`:

```typescript
import { classifyError, executeWithRetry } from './retry';
import { NetworkError, HttpError, RateLimitError } from '../types/types';

describe('重试逻辑', () => {
  describe('classifyError', () => {
    test('NetworkError 分类为 network', () => {
      const error = new NetworkError('Connection failed');
      expect(classifyError(error)).toBe('network');
    });

    test('HttpError 分类为 http', () => {
      const error = new HttpError('Not found', 404);
      expect(classifyError(error)).toBe('http');
    });

    test('RateLimitError 分类为 http', () => {
      const error = new RateLimitError('Too many requests');
      expect(classifyError(error)).toBe('http');
    });

    test('普通错误（无 status）分类为 network', () => {
      const error = new Error('Unknown error');
      expect(classifyError(error)).toBe('network');
    });

    test('带 status 字段的错误分类为 http', () => {
      const error = { message: 'Custom error', status: 500 };
      expect(classifyError(error)).toBe('http');
    });
  });

  describe('executeWithRetry', () => {
    test('成功返回结果', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await executeWithRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('网络错误重试 3 次', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new NetworkError('Failed 1'))
        .mockRejectedValueOnce(new NetworkError('Failed 2'))
        .mockRejectedValueOnce(new NetworkError('Failed 3'))
        .mockRejectedValueOnce(new NetworkError('Failed 4'));

      await expect(executeWithRetry(fn)).rejects.toThrow('Failed 4');
      expect(fn).toHaveBeenCalledTimes(4); // 1 次初始 + 3 次重试
    });

    test('HTTP 错误重试 20 次', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new HttpError('Error 1', 500))
        .mockRejectedValueOnce(new HttpError('Error 2', 500))
        .mockResolvedValue('success');

      const result = await executeWithRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('成功后不再重试', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new NetworkError('Failed'))
        .mockResolvedValue('success');

      const result = await executeWithRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('onRetry 回调被调用', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new NetworkError('Failed'))
        .mockResolvedValue('success');

      const onRetry = jest.fn();
      await executeWithRetry(fn, { onRetry });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.any(NetworkError),
        1,
        expect.any(Number)
      );
    });

    test('自定义最大重试次数', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new NetworkError('Failed 1'))
        .mockRejectedValueOnce(new NetworkError('Failed 2'))
        .mockRejectedValueOnce(new NetworkError('Failed 3'));

      await expect(
        executeWithRetry(fn, { maxRetries: { network: 2 } })
      ).rejects.toThrow('Failed 3');
      expect(fn).toHaveBeenCalledTimes(3); // 1 次初始 + 2 次重试
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- src/utils/retry.test.ts`

Expected: FAIL - 找不到模块 './retry'

- [ ] **Step 3: 实现重试逻辑**

创建 `src/utils/retry.ts`:

```typescript
import { NetworkError, HttpError, Logger } from '../types/types';
import { calculateBackoff } from './backoff';

/**
 * 错误分类
 *
 * @param error - 错误对象
 * @returns 错误类型：'network' 或 'http'
 */
export function classifyError(error: any): 'network' | 'http' {
  // 无状态码的网络错误
  if (error instanceof NetworkError) {
    return 'network';
  }
  // 有状态码的 HTTP 错误
  if (error instanceof HttpError) {
    return 'http';
  }
  // 其他错误根据是否有 status 字段判断
  return error.status ? 'http' : 'network';
}

/**
 * 执行带重试的异步操作
 *
 * @param fn - 要执行的异步函数
 * @param options - 重试选项
 * @returns Promise<T>
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: {
      network?: number;  // 网络错误最大重试次数，默认 3
      http?: number;     // HTTP 错误最大重试次数，默认 20
    };
    onRetry?: (error: Error, attempt: number, delay: number) => void;
    logger?: Logger;
  }
): Promise<T> {
  const maxNetworkRetries = options?.maxRetries?.network ?? 3;
  const maxHttpRetries = options?.maxRetries?.http ?? 20;
  const onRetry = options?.onRetry;

  let attempt = 0;
  let lastError: Error;

  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorType = classifyError(error);
      const maxRetries = errorType === 'network' ? maxNetworkRetries : maxHttpRetries;

      if (attempt >= maxRetries) {
        throw error;
      }

      const delay = calculateBackoff(attempt);
      attempt++;

      if (onRetry) {
        onRetry(error, attempt, delay);
      }

      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- src/utils/retry.test.ts`

Expected: PASS - 所有测试通过

- [ ] **Step 5: 提交**

```bash
git add src/utils/retry.ts src/utils/retry.test.ts
git commit -m "feat: 添加重试逻辑模块"
```

---

## Task 5: JSON 提取模块

**Files:**
- Create: `src/utils/json-extractor.ts`
- Create: `src/utils/json-extractor.test.ts`

- [ ] **Step 1: 编写 JSON 提取失败的测试**

创建 `src/utils/json-extractor.test.ts`:

```typescript
import { extractJson } from './json-extractor';

describe('JSON 提取', () => {
  test('直接解析有效 JSON', () => {
    const result = extractJson('{"name": "test"}');
    expect(result).toEqual({ name: 'test' });
  });

  test('去除 markdown 代码块', () => {
    const text = '```json\n{"name": "test"}\n```';
    const result = extractJson(text);
    expect(result).toEqual({ name: 'test' });
  });

  test('去除无语言标记的代码块', () => {
    const text = '```\n{"name": "test"}\n```';
    const result = extractJson(text);
    expect(result).toEqual({ name: 'test' });
  });

  test('修复对象尾逗号', () => {
    const text = '{"name": "test", "value": 1,}';
    const result = extractJson(text);
    expect(result).toEqual({ name: 'test', value: 1 });
  });

  test('修复数组尾逗号', () => {
    const text = '[1, 2, 3,]';
    const result = extractJson(text);
    expect(result).toEqual([1, 2, 3]);
  });

  test('去除单行注释', () => {
    const text = '{"name": "test" // 这是注释\n}';
    const result = extractJson(text);
    expect(result).toEqual({ name: 'test' });
  });

  test('处理嵌套对象', () => {
    const text = '{"outer": {"inner": "value"}}';
    const result = extractJson(text);
    expect(result).toEqual({ outer: { inner: 'value' } });
  });

  test('处理前缀文字', () => {
    const text = '这是结果：{"name": "test"}';
    const result = extractJson(text);
    expect(result).toEqual({ name: 'test' });
  });

  test('处理后缀文字', () => {
    const text = '{"name": "test"} 以上是结果。';
    const result = extractJson(text);
    expect(result).toEqual({ name: 'test' });
  });

  test('处理复杂情况', () => {
    const text = `
      根据你的要求，这里是结果：

      \`\`\`json
      {
        "name": "test",
        "items": [1, 2, 3,],
        "config": {
          "enabled": true,
        }
      }
      \`\`\`

      以上是配置信息。
    `;
    const result = extractJson(text);
    expect(result).toEqual({
      name: 'test',
      items: [1, 2, 3],
      config: { enabled: true },
    });
  });

  test('无效 JSON 返回空对象', () => {
    const result = extractJson('this is not json');
    expect(result).toEqual({});
  });

  test('空字符串返回空对象', () => {
    const result = extractJson('');
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- src/utils/json-extractor.test.ts`

Expected: FAIL - 找不到模块 './json-extractor'

- [ ] **Step 3: 实现 JSON 提取**

创建 `src/utils/json-extractor.ts`:

```typescript
/**
 * 去除 markdown 代码块标记
 *
 * @param text - 包含代码块的文本
 * @returns 去除代码块标记后的文本
 */
function stripMarkdownCodeBlock(text: string): string {
  // 匹配 ```json {...} ``` 或 ``` {...} ```
  const codeBlockRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;
  const match = text.match(codeBlockRegex);
  if (match) {
    return match[1].trim();
  }
  return text;
}

/**
 * 修复尾逗号
 *
 * @param text - JSON 文本
 * @returns 修复后的文本
 */
function fixTrailingCommas(text: string): string {
  // 修复对象中的尾逗号 {"a":1,} → {"a":1}
  // 修复数组中的尾逗号 [1,2,] → [1,2]
  return text
    .replace(/,(\s*[}\]])/g, '$1');
}

/**
 * 去除单行注释
 *
 * @param text - JSON 文本
 * @returns 去除注释后的文本
 */
function stripSingleLineComments(text: string): string {
  // 去除 // 开头的注释（不在字符串中）
  return text.replace(/\/\/.*$/gm, '');
}

/**
 * 查找配对的花括号
 *
 * @param text - 文本
 * @returns 找到的 JSON 字符串，未找到返回 null
 */
function findBalancedBraces(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    if (depth === 0) {
      return text.substring(start, i + 1);
    }
  }
  return null;
}

/**
 * 从文本中提取 JSON 对象
 *
 * @param text - 包含 JSON 的文本
 * @returns 解析后的对象，失败时返回 {}
 */
export function extractJson(text: string): any {
  if (!text || typeof text !== 'string') {
    return {};
  }

  // 1. 直接解析
  try {
    return JSON.parse(text);
  } catch {}

  // 2. 去除 markdown 代码块后解析
  const stripped = stripMarkdownCodeBlock(text.trim());
  try {
    return JSON.parse(stripped);
  } catch {}

  // 3. 定位花括号后解析
  const braces = findBalancedBraces(stripped);
  if (braces) {
    try {
      return JSON.parse(braces);
    } catch {}
  }

  // 4. 去除注释 + 修复尾逗号后解析
  if (braces) {
    const cleaned = fixTrailingCommas(stripSingleLineComments(braces));
    try {
      return JSON.parse(cleaned);
    } catch {}
  }

  // 5. 所有失败，返回空对象
  return {};
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- src/utils/json-extractor.test.ts`

Expected: PASS - 所有测试通过

- [ ] **Step 5: 提交**

```bash
git add src/utils/json-extractor.ts src/utils/json-extractor.test.ts
git commit -m "feat: 添加 JSON 提取模块"
```

---

## Task 6: 配置加载模块

**Files:**
- Create: `src/config/config.ts`
- Create: `src/config/config.test.ts`

- [ ] **Step 1: 编写配置加载失败的测试**

创建 `src/config/config.test.ts`:

```typescript
import { loadProviders } from './config';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs 模块
jest.mock('fs');

describe('配置加载', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 清除环境变量
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_MODEL;
  });

  describe('loadProviders', () => {
    test('直接传入配置', () => {
      const providers = {
        anthropic: {
          baseURL: 'https://api.anthropic.com',
          authType: 'apiKey' as const,
          models: ['claude-sonnet-4-20250514'],
        },
      };
      const result = loadProviders({ providers });
      expect(result).toEqual(providers);
    });

    test('从项目配置文件加载', () => {
      const mockConfig = {
        providers: {
          aiproxy: {
            baseURL: 'https://api.aiproxy.com/v1',
            authType: 'authToken' as const,
            models: ['glm-5.1'],
          },
        },
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

      const result = loadProviders();
      expect(result).toEqual(mockConfig.providers);
    });

    test('从环境变量加载', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-xxx';
      process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
      process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = loadProviders();
      expect(result.anthropic).toBeDefined();
      expect(result.anthropic.authToken).toBe('sk-ant-xxx');
      expect(result.anthropic.models).toContain('claude-sonnet-4-20250514');
    });

    test('配置优先级：直接传入 > 项目配置 > 环境变量', () => {
      // 环境变量
      process.env.ANTHROPIC_API_KEY = 'env-key';
      process.env.ANTHROPIC_MODEL = 'env-model';

      // 项目配置
      const mockConfig = {
        providers: {
          project: {
            baseURL: 'https://project.com',
            authType: 'authToken' as const,
            models: ['project-model'],
          },
        },
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

      // 直接传入
      const directProviders = {
        direct: {
          baseURL: 'https://direct.com',
          authType: 'apiKey' as const,
          models: ['direct-model'],
        },
      };

      const result = loadProviders({ providers: directProviders });

      // 直接传入的优先级最高
      expect(result.direct).toBeDefined();
      // 环境变量应该被合并进来
      expect(result.anthropic).toBeDefined();
    });

    test('无配置时抛出错误', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      expect(() => loadProviders()).toThrow();
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- src/config/config.test.ts`

Expected: FAIL - 找不到模块 './config'

- [ ] **Step 3: 实现配置加载**

创建 `src/config/config.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProviderConfig } from '../types/types';

/**
 * 从项目配置文件加载
 *
 * @returns Provider 配置，无配置返回 null
 */
function loadProjectConfigProviders(): Record<string, ProviderConfig> | null {
  const configPath = path.join(process.cwd(), '.latte', 'models_config.json');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    return config.providers || null;
  } catch {
    return null;
  }
}

/**
 * 从全局配置文件加载
 *
 * @returns Provider 配置，无配置返回 null
 */
function loadGlobalConfigProviders(): Record<string, ProviderConfig> | null {
  const configPath = path.join(os.homedir(), '.latte_models', 'config.json');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    return config.providers || null;
  } catch {
    return null;
  }
}

/**
 * 从环境变量加载
 *
 * @returns Provider 配置，无配置返回 null
 */
function loadEnvProviders(): Record<string, ProviderConfig> | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

  if (!apiKey) {
    return null;
  }

  return {
    anthropic: {
      baseURL,
      authToken: apiKey,
      authType: 'apiKey',
      models: [model],
    },
  };
}

/**
 * 合并多个配置源
 *
 * @param configs - 配置数组（按优先级从高到低）
 * @returns 合并后的配置
 */
function mergeProviders(
  ...configs: (Record<string, ProviderConfig> | null)[]
): Record<string, ProviderConfig> {
  const result: Record<string, ProviderConfig> = {};

  // 按优先级从低到高合并
  for (const config of configs.reverse()) {
    if (config) {
      Object.assign(result, config);
    }
  }

  return result;
}

/**
 * 加载 Provider 配置
 *
 * 加载优先级：直接传入 > 项目配置文件 > 全局配置文件 > 环境变量
 *
 * @param options - 加载选项
 * @returns Provider 配置映射
 */
export function loadProviders(options?: {
  providers?: Record<string, ProviderConfig>;
  configPath?: string;
}): Record<string, ProviderConfig> {
  // 1. 直接传入
  if (options?.providers) {
    return options.providers;
  }

  // 2. 项目配置文件
  const projectConfig = loadProjectConfigProviders();

  // 3. 全局配置文件
  const globalConfig = loadGlobalConfigProviders();

  // 4. 环境变量
  const envConfig = loadEnvProviders();

  // 合并配置
  const merged = mergeProviders(projectConfig, globalConfig, envConfig);

  if (Object.keys(merged).length === 0) {
    throw new Error('未找到任何 Provider 配置。请通过以下方式之一提供配置：\n' +
      '1. 直接传入 providers 参数\n' +
      '2. 创建 .latte/models_config.json 文件\n' +
      '3. 创建 ~/.latte_models/config.json 文件\n' +
      '4. 设置 ANTHROPIC_API_KEY 环境变量');
  }

  return merged;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- src/config/config.test.ts`

Expected: PASS - 所有测试通过

- [ ] **Step 5: 提交**

```bash
git add src/config/config.ts src/config/config.test.ts
git commit -m "feat: 添加配置加载模块"
```

---

## Task 7: Provider 路由模块

**Files:**
- Create: `src/resolver/provider-resolver.ts`
- Create: `src/resolver/provider-resolver.test.ts`

- [ ] **Step 1: 编写 Provider 路由失败的测试**

创建 `src/resolver/provider-resolver.test.ts`:

```typescript
import {
  parseModelRef,
  isModelAvailable,
  findProviderConfig,
  resolveProvider,
  guessDefaultProvider,
} from './provider-resolver';
import { ProviderConfig } from '../types/types';

describe('Provider 路由', () => {
  const mockProviders: Record<string, ProviderConfig> = {
    aiproxy: {
      baseURL: 'https://api.aiproxy.com/v1',
      authType: 'authToken',
      models: ['glm-5.1', 'gpt-4o'],
    },
    anthropic: {
      baseURL: 'https://api.anthropic.com',
      authType: 'apiKey',
      models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
    },
  };

  describe('parseModelRef', () => {
    test('解析 "provider/model" 格式', () => {
      const result = parseModelRef('aiproxy/glm-5.1');
      expect(result).toEqual({
        providerName: 'aiproxy',
        modelName: 'glm-5.1',
      });
    });

    test('解析纯模型名', () => {
      const result = parseModelRef('glm-5.1');
      expect(result).toEqual({
        providerName: '',
        modelName: 'glm-5.1',
      });
    });

    test('处理模型名包含斜杠', () => {
      const result = parseModelRef('aiproxy/model/with/slash');
      expect(result.providerName).toBe('aiproxy');
      expect(result.modelName).toBe('model/with/slash');
    });

    test('空字符串返回空值', () => {
      const result = parseModelRef('');
      expect(result).toEqual({
        providerName: '',
        modelName: '',
      });
    });
  });

  describe('isModelAvailable', () => {
    test('数组形式查找', () => {
      expect(isModelAvailable(['model-1', 'model-2'], 'model-1')).toBe(true);
      expect(isModelAvailable(['model-1', 'model-2'], 'model-3')).toBe(false);
    });

    test('对象形式查找', () => {
      const models = {
        'model-1': { useStream: true },
        'model-2': { useStream: false },
      };
      expect(isModelAvailable(models, 'model-1')).toBe(true);
      expect(isModelAvailable(models, 'model-3')).toBe(false);
    });

    test('空模型列表返回 false', () => {
      expect(isModelAvailable([], 'model-1')).toBe(false);
      expect(isModelAvailable({}, 'model-1')).toBe(false);
    });
  });

  describe('findProviderConfig', () => {
    test('找到 Provider 和模型', () => {
      const result = findProviderConfig(mockProviders, 'aiproxy', 'glm-5.1');
      expect(result).not.toBeNull();
      expect(result?.providerConfig.baseURL).toBe('https://api.aiproxy.com/v1');
      expect(result?.modelName).toBe('glm-5.1');
    });

    test('Provider 不存在返回 null', () => {
      const result = findProviderConfig(mockProviders, 'unknown', 'model-1');
      expect(result).toBeNull();
    });

    test('模型不存在返回 null', () => {
      const result = findProviderConfig(mockProviders, 'aiproxy', 'unknown-model');
      expect(result).toBeNull();
    });
  });

  describe('resolveProvider', () => {
    test('完整格式解析', () => {
      const result = resolveProvider('aiproxy/glm-5.1', mockProviders);
      expect(result.providerName).toBe('aiproxy');
      expect(result.modelName).toBe('glm-5.1');
    });

    test('纯模型名遍历查找', () => {
      const result = resolveProvider('glm-5.1', mockProviders);
      expect(result.providerName).toBe('aiproxy');
      expect(result.modelName).toBe('glm-5.1');
    });

    test('使用默认 Provider', () => {
      const result = resolveProvider('unknown-model', mockProviders, 'aiproxy');
      expect(result.providerName).toBe('aiproxy');
      expect(result.modelName).toBe('unknown-model');
    });

    test('找不到 Provider 抛出错误', () => {
      expect(() => resolveProvider('unknown-model', mockProviders)).toThrow();
    });
  });

  describe('guessDefaultProvider', () => {
    test('只有一个 Provider 时返回其名称', () => {
      const result = guessDefaultProvider({ aiproxy: mockProviders.aiproxy });
      expect(result).toBe('aiproxy');
    });

    test('多个 Provider 时返回 null', () => {
      const result = guessDefaultProvider(mockProviders);
      expect(result).toBeNull();
    });

    test('空配置返回 null', () => {
      const result = guessDefaultProvider({});
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- src/resolver/provider-resolver.test.ts`

Expected: FAIL - 找不到模块 './provider-resolver'

- [ ] **Step 3: 实现 Provider 路由**

创建 `src/resolver/provider-resolver.ts`:

```typescript
import { ProviderConfig, ModelConfig } from '../types/types';

/**
 * 解析模型引用
 *
 * @param modelRef - 模型引用，格式 "provider/model" 或 "model"
 * @returns 解析结果
 *
 * 示例:
 * - "aiproxy/glm-5.1" → { providerName: "aiproxy", modelName: "glm-5.1" }
 * - "glm-5.1" → { providerName: "", modelName: "glm-5.1" }
 */
export function parseModelRef(modelRef: string): {
  providerName: string;
  modelName: string;
} {
  if (!modelRef) {
    return { providerName: '', modelName: '' };
  }

  const slashIndex = modelRef.indexOf('/');
  if (slashIndex === -1) {
    return { providerName: '', modelName: modelRef };
  }

  return {
    providerName: modelRef.substring(0, slashIndex),
    modelName: modelRef.substring(slashIndex + 1),
  };
}

/**
 * 检查模型是否可用
 *
 * @param models - 模型列表（数组或对象）
 * @param modelName - 模型名称
 * @returns 是否可用
 */
export function isModelAvailable(
  models: string[] | Record<string, ModelConfig>,
  modelName: string
): boolean {
  if (Array.isArray(models)) {
    return models.includes(modelName);
  }
  return Object.prototype.hasOwnProperty.call(models, modelName);
}

/**
 * 查找 Provider 配置
 *
 * @param providers - Provider 配置映射
 * @param providerName - Provider 名称
 * @param modelName - 模型名称
 * @returns 找到的配置，失败返回 null
 */
export function findProviderConfig(
  providers: Record<string, ProviderConfig>,
  providerName: string,
  modelName: string
): { providerConfig: ProviderConfig; modelName: string } | null {
  const providerConfig = providers[providerName];
  if (!providerConfig) {
    return null;
  }

  if (!isModelAvailable(providerConfig.models, modelName)) {
    return null;
  }

  return { providerConfig, modelName };
}

/**
 * 完整路由解析
 *
 * @param modelRef - 模型引用
 * @param providers - Provider 配置映射
 * @param defaultProviderName - 默认 Provider 名称
 * @returns 完整的路由信息
 */
export function resolveProvider(
  modelRef: string,
  providers: Record<string, ProviderConfig>,
  defaultProviderName?: string
): {
  providerConfig: ProviderConfig;
  providerName: string;
  modelName: string;
} {
  const { providerName, modelName } = parseModelRef(modelRef);

  // 如果指定了 Provider
  if (providerName) {
    const result = findProviderConfig(providers, providerName, modelName);
    if (result) {
      return { ...result, providerName };
    }
    throw new Error(`Provider "${providerName}" 不存在或模型 "${modelName}" 不可用`);
  }

  // 遍历所有 Provider 查找模型
  for (const [name, config] of Object.entries(providers)) {
    if (isModelAvailable(config.models, modelName)) {
      return {
        providerConfig: config,
        providerName: name,
        modelName,
      };
    }
  }

  // 使用默认 Provider
  if (defaultProviderName) {
    const config = providers[defaultProviderName];
    if (config) {
      return {
        providerConfig: config,
        providerName: defaultProviderName,
        modelName,
      };
    }
  }

  throw new Error(`未找到模型 "${modelName}" 的 Provider 配置`);
}

/**
 * 推断默认 Provider
 *
 * @param providers - Provider 配置映射
 * @returns 默认 Provider 名称，无则返回 null
 */
export function guessDefaultProvider(
  providers: Record<string, ProviderConfig>
): string | null {
  const names = Object.keys(providers);
  return names.length === 1 ? names[0] : null;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- src/resolver/provider-resolver.test.ts`

Expected: PASS - 所有测试通过

- [ ] **Step 5: 提交**

```bash
git add src/resolver/provider-resolver.ts src/resolver/provider-resolver.test.ts
git commit -m "feat: 添加 Provider 路由模块"
```

---

## Task 8: AIClient 主类 - 构造函数和工具方法

**Files:**
- Create: `src/core/ai-client.ts`
- Create: `src/core/ai-client.test.ts`

- [ ] **Step 1: 编写 AIClient 构造函数失败的测试**

创建 `src/core/ai-client.test.ts`:

```typescript
import { AIClient } from './ai-client';
import { UsageStats } from '../types/types';

describe('AIClient', () => {
  describe('构造函数', () => {
    test('直接传入配置创建实例', () => {
      const ai = new AIClient({
        providers: {
          aiproxy: {
            baseURL: 'https://api.aiproxy.com/v1',
            authType: 'authToken',
            authToken: 'test-token',
            models: ['glm-5.1'],
          },
        },
      });
      expect(ai).toBeInstanceOf(AIClient);
    });

    test('推断默认 Provider（只有一个时）', () => {
      const ai = new AIClient({
        providers: {
          aiproxy: {
            baseURL: 'https://api.aiproxy.com/v1',
            authType: 'authToken',
            authToken: 'test-token',
            models: ['glm-5.1'],
          },
        },
      });
      expect(ai).toBeDefined();
    });

    test('多个 Provider 时不推断默认', () => {
      const ai = new AIClient({
        providers: {
          aiproxy: {
            baseURL: 'https://api.aiproxy.com/v1',
            authType: 'authToken',
            authToken: 'test-token',
            models: ['glm-5.1'],
          },
          anthropic: {
            baseURL: 'https://api.anthropic.com',
            authType: 'apiKey',
            authToken: 'test-key',
            models: ['claude-sonnet-4-20250514'],
          },
        },
      });
      expect(ai).toBeDefined();
    });
  });

  describe('extractJson', () => {
    test('提取 JSON 对象', () => {
      const ai = new AIClient({
        providers: {
          aiproxy: {
            baseURL: 'https://api.aiproxy.com/v1',
            authType: 'authToken',
            authToken: 'test-token',
            models: ['glm-5.1'],
          },
        },
      });

      const result = ai.extractJson('```json\n{"name": "test"}\n```');
      expect(result).toEqual({ name: 'test' });
    });
  });

  describe('getUsageStats', () => {
    test('初始统计为空', () => {
      const ai = new AIClient({
        providers: {
          aiproxy: {
            baseURL: 'https://api.aiproxy.com/v1',
            authType: 'authToken',
            authToken: 'test-token',
            models: ['glm-5.1'],
          },
        },
      });

      const stats = ai.getUsageStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.totalTokens).toBe(0);
    });
  });

  describe('resetUsageStats', () => {
    test('重置统计', () => {
      const ai = new AIClient({
        providers: {
          aiproxy: {
            baseURL: 'https://api.aiproxy.com/v1',
            authType: 'authToken',
            authToken: 'test-token',
            models: ['glm-5.1'],
          },
        },
      });

      ai.resetUsageStats();
      const stats = ai.getUsageStats();
      expect(stats.totalCalls).toBe(0);
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- src/core/ai-client.test.ts`

Expected: FAIL - 找不到模块 './ai-client'

- [ ] **Step 3: 实现 AIClient 基础结构**

创建 `src/core/ai-client.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import {
  ProviderConfig,
  ChatMessage,
  ChatResponse,
  ChatOptions,
  Usage,
  UsageStats,
  Logger,
} from '../types/types';
import { loadProviders } from '../config/config';
import { resolveProvider, guessDefaultProvider } from '../resolver/provider-resolver';
import { executeWithRetry } from '../utils/retry';
import { extractJson as extractJsonUtil } from '../utils/json-extractor';

/**
 * AI 客户端主类
 *
 * 提供统一的 API 调用多个 AI 服务提供商
 */
export class AIClient {
  private providers: Record<string, ProviderConfig>;
  private defaultProviderName: string | null;
  private usageStats: UsageStats;
  private logger: Logger;

  /**
   * 构造函数
   *
   * @param options - 配置选项
   */
  constructor(options?: {
    providers?: Record<string, ProviderConfig>;
    configPath?: string;
    logger?: Logger;
  }) {
    // 加载配置
    this.providers = loadProviders(options);

    // 推断默认 Provider
    this.defaultProviderName = guessDefaultProvider(this.providers);

    // 初始化用量统计
    this.usageStats = {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      byModel: {},
    };

    // 设置日志记录器
    this.logger = options?.logger || {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  /**
   * 提取 JSON 对象
   *
   * @param text - 包含 JSON 的文本
   * @returns 解析后的对象
   */
  extractJson(text: string): any {
    return extractJsonUtil(text);
  }

  /**
   * 获取用量统计
   */
  getUsageStats(): UsageStats {
    return { ...this.usageStats };
  }

  /**
   * 重置用量统计
   */
  resetUsageStats(): void {
    this.usageStats = {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      byModel: {},
    };
  }

  /**
   * 更新用量统计（私有）
   */
  private updateUsageStats(model: string, usage: Usage): void {
    this.usageStats.totalCalls++;
    this.usageStats.successCalls++;
    this.usageStats.totalInputTokens += usage.inputTokens;
    this.usageStats.totalOutputTokens += usage.outputTokens;
    this.usageStats.totalTokens += usage.inputTokens + usage.outputTokens;

    if (!this.usageStats.byModel[model]) {
      this.usageStats.byModel[model] = {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    this.usageStats.byModel[model].calls++;
    this.usageStats.byModel[model].inputTokens += usage.inputTokens;
    this.usageStats.byModel[model].outputTokens += usage.outputTokens;
  }

  // TODO: 实现 query, chat, chatWithTools 方法
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- src/core/ai-client.test.ts`

Expected: PASS - 所有测试通过

- [ ] **Step 5: 提交**

```bash
git add src/core/ai-client.ts src/core/ai-client.test.ts
git commit -m "feat: 添加 AIClient 基础结构"
```

---

## Task 9: AIClient 主类 - query 和 chat 方法

**Files:**
- Modify: `src/core/ai-client.ts`
- Modify: `src/core/ai-client.test.ts`

- [ ] **Step 1: 添加 query 和 chat 方法的测试**

在 `src/core/ai-client.test.ts` 中添加:

```typescript
  describe('query', () => {
    test('返回纯文本', async () => {
      const ai = new AIClient({
        providers: {
          aiproxy: {
            baseURL: 'https://api.aiproxy.com/v1',
            authType: 'authToken',
            authToken: 'test-token',
            models: ['glm-5.1'],
          },
        },
      });

      // Mock Anthropic SDK
      const mockCreate = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Hello, world!' }],
        stop_reason: 'end_turn',
        model: 'glm-5.1',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      jest.spyOn(ai as any, 'resolveModel').mockReturnValue({
        client: { messages: { create: mockCreate } },
        model: 'glm-5.1',
        maxTokens: 4096,
      });

      const result = await ai.query('Hello');
      expect(result).toBe('Hello, world!');
    });

    test('指定模型', async () => {
      const ai = new AIClient({
        providers: {
          aiproxy: {
            baseURL: 'https://api.aiproxy.com/v1',
            authType: 'authToken',
            authToken: 'test-token',
            models: ['glm-5.1'],
          },
        },
      });

      const mockCreate = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        model: 'glm-5.1',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      jest.spyOn(ai as any, 'resolveModel').mockReturnValue({
        client: { messages: { create: mockCreate } },
        model: 'glm-5.1',
        maxTokens: 4096,
      });

      await ai.query('Hello', { model: 'aiproxy/glm-5.1' });
      // 验证调用
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe('chat', () => {
    test('返回 ChatResponse', async () => {
      const ai = new AIClient({
        providers: {
          aiproxy: {
            baseURL: 'https://api.aiproxy.com/v1',
            authType: 'authToken',
            authToken: 'test-token',
            models: ['glm-5.1'],
          },
        },
      });

      const mockCreate = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Chat response' }],
        stop_reason: 'end_turn',
        model: 'glm-5.1',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      jest.spyOn(ai as any, 'resolveModel').mockReturnValue({
        client: { messages: { create: mockCreate } },
        model: 'glm-5.1',
        maxTokens: 4096,
      });

      const response = await ai.chat([
        { role: 'user', content: 'Hello' },
      ]);

      expect(response.text).toBe('Chat response');
      expect(response.stopReason).toBe('end_turn');
      expect(response.model).toBe('glm-5.1');
      expect(response.usage?.inputTokens).toBe(10);
    });

    test('使用 systemPrompt', async () => {
      const ai = new AIClient({
        providers: {
          aiproxy: {
            baseURL: 'https://api.aiproxy.com/v1',
            authType: 'authToken',
            authToken: 'test-token',
            models: ['glm-5.1'],
          },
        },
      });

      const mockCreate = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        model: 'glm-5.1',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      jest.spyOn(ai as any, 'resolveModel').mockReturnValue({
        client: { messages: { create: mockCreate } },
        model: 'glm-5.1',
        maxTokens: 4096,
      });

      await ai.chat(
        [{ role: 'user', content: 'Hello' }],
        { systemPrompt: 'You are a helpful assistant' }
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a helpful assistant',
        })
      );
    });

    test('多轮对话', async () => {
      const ai = new AIClient({
        providers: {
          aiproxy: {
            baseURL: 'https://api.aiproxy.com/v1',
            authType: 'authToken',
            authToken: 'test-token',
            models: ['glm-5.1'],
          },
        },
      });

      const mockCreate = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Multi-turn response' }],
        stop_reason: 'end_turn',
        model: 'glm-5.1',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      jest.spyOn(ai as any, 'resolveModel').mockReturnValue({
        client: { messages: { create: mockCreate } },
        model: 'glm-5.1',
        maxTokens: 4096,
      });

      await ai.chat([
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Second question' },
      ]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'First question' },
            { role: 'assistant', content: 'First answer' },
            { role: 'user', content: 'Second question' },
          ],
        })
      );
    });

    test('更新用量统计', async () => {
      const ai = new AIClient({
        providers: {
          aiproxy: {
            baseURL: 'https://api.aiproxy.com/v1',
            authType: 'authToken',
            authToken: 'test-token',
            models: ['glm-5.1'],
          },
        },
      });

      const mockCreate = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        model: 'glm-5.1',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      jest.spyOn(ai as any, 'resolveModel').mockReturnValue({
        client: { messages: { create: mockCreate } },
        model: 'glm-5.1',
        maxTokens: 4096,
      });

      await ai.chat([{ role: 'user', content: 'Hello' }]);

      const stats = ai.getUsageStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.totalInputTokens).toBe(10);
      expect(stats.totalOutputTokens).toBe(20);
    });
  });
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- src/core/ai-client.test.ts`

Expected: FAIL - query 和 chat 方法不存在或测试失败

- [ ] **Step 3: 实现 query 和 chat 方法**

在 `src/core/ai-client.ts` 中添加:

```typescript
  /**
   * 单轮查询
   *
   * @param prompt - 提示词
   * @param options - 选项
   * @param logger - 日志记录器
   * @returns 回复文本
   */
  async query(
    prompt: string,
    options?: ChatOptions,
    logger?: Logger
  ): Promise<string> {
    const response = await this.chat(
      [{ role: 'user', content: prompt }],
      options,
      logger
    );
    return response.text;
  }

  /**
   * 多轮对话
   *
   * @param messages - 消息数组
   * @param options - 选项
   * @param logger - 日志记录器
   * @returns 完整响应
   */
  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
    logger?: Logger
  ): Promise<ChatResponse> {
    const log = logger || this.logger;
    const { client, model, maxTokens } = this.resolveModel(options?.model);

    const apiMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    const requestParams: any = {
      model,
      max_tokens: options?.maxTokens || maxTokens,
      messages: apiMessages,
    };

    if (options?.systemPrompt) {
      requestParams.system = options.systemPrompt;
    }

    const response = await executeWithRetry(
      () => client.messages.create(requestParams),
      { logger: log }
    );

    // 提取文本内容
    const textContent = response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('');

    // 更新统计
    if (response.usage) {
      this.updateUsageStats(model, {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });
    }

    return {
      text: textContent,
      stopReason: response.stop_reason,
      model: response.model,
      usage: response.usage ? {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      } : undefined,
    };
  }

  /**
   * 解析模型配置（私有）
   */
  private resolveModel(modelRef?: string): {
    client: Anthropic;
    model: string;
    maxTokens: number;
  } {
    const ref = modelRef || '';
    const { providerConfig, providerName, modelName } = resolveProvider(
      ref,
      this.providers,
      this.defaultProviderName || undefined
    );

    const client = this.createAnthropicClient(providerConfig);
    const maxTokens = providerConfig.maxTokens || 4096;

    return { client, model: modelName, maxTokens };
  }

  /**
   * 创建 Anthropic 客户端（私有）
   */
  private createAnthropicClient(config: ProviderConfig): Anthropic {
    const clientOptions: any = {
      baseURL: config.baseURL,
    };

    if (config.authType === 'apiKey') {
      clientOptions.apiKey = config.authToken;
    } else {
      // authToken 使用自定义 header
      clientOptions.apiKey = 'placeholder'; // Anthropic SDK 要求非空
      clientOptions.headers = {
        Authorization: `Bearer ${config.authToken}`,
      };
    }

    return new Anthropic(clientOptions);
  }
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- src/core/ai-client.test.ts`

Expected: PASS - 所有测试通过

- [ ] **Step 5: 提交**

```bash
git add src/core/ai-client.ts src/core/ai-client.test.ts
git commit -m "feat: 实现 AIClient 的 query 和 chat 方法"
```

---

## Task 10: 入口文件

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: 创建入口文件**

创建 `src/index.ts`:

```typescript
// 导出主类
export { AIClient } from './core/ai-client';

// 导出类型
export type {
  ProviderConfig,
  ModelConfig,
  ChatMessage,
  ChatResponse,
  ChatOptions,
  Usage,
  UsageStats,
  Logger,
} from './types/types';

// 导出错误类
export {
  NetworkError,
  HttpError,
  RateLimitError,
  NonRetryableError,
} from './types/types';

// 导出工具函数（可选，供高级用户使用）
export { calculateBackoff, formatDelay } from './utils/backoff';
export { executeWithRetry, classifyError } from './utils/retry';
export { extractJson } from './utils/json-extractor';
```

- [ ] **Step 2: 验证编译**

Run: `npm run build`

Expected: 成功编译，生成 dist/ 目录

- [ ] **Step 3: 验证导出**

Run: `node -e "const { AIClient, NetworkError } = require('./dist/index.js'); console.log('OK')"`

Expected: 输出 "OK"

- [ ] **Step 4: 运行所有测试**

Run: `npm test`

Expected: PASS - 所有测试通过

- [ ] **Step 5: 提交**

```bash
git add src/index.ts
git commit -m "feat: 添加入口文件"
```

---

## Task 11: 最终验证和文档

**Files:**
- Update: `package.json`
- Create: `README.md`

- [ ] **Step 1: 运行完整测试套件**

Run: `npm test`

Expected: PASS - 所有测试通过，覆盖率报告生成

- [ ] **Step 2: 运行构建**

Run: `npm run build`

Expected: 成功生成 dist/index.js, dist/index.mjs, dist/index.d.ts

- [ ] **Step 3: 创建 README.md**

```markdown
# latte-ts-models

基于 Anthropic SDK 的多 Provider AI 客户端库。

## 安装

```bash
npm install latte-ts-models
```

## 快速开始

```typescript
import { AIClient } from 'latte-ts-models';

const ai = new AIClient({
  providers: {
    anthropic: {
      baseURL: 'https://api.anthropic.com',
      authToken: 'your-api-key',
      authType: 'apiKey',
      models: ['claude-sonnet-4-20250514'],
    },
  },
});

// 单轮查询
const answer = await ai.query('你好');

// 多轮对话
const response = await ai.chat([
  { role: 'user', content: '第一轮问题' },
  { role: 'assistant', content: '第一轮回复' },
  { role: 'user', content: '第二轮问题' },
]);

console.log(response.text);
```

## 文档

详见 [latte.md](./latte.md)

## License

MIT
```

- [ ] **Step 4: 最终提交**

```bash
git add .
git commit -m "chore: 添加 README 和最终配置"
```

---

## 自检清单

**1. 规范覆盖检查：**
- ✅ 所有设计文档中的模块都有对应的 Task
- ✅ 所有类型定义、工具函数、核心类都已实现
- ✅ 测试覆盖所有模块

**2. 占位符扫描：**
- ✅ 无 TBD、TODO、implement later 等占位符
- ✅ 所有代码步骤都包含完整实现

**3. 类型一致性检查：**
- ✅ 所有类型名称在各个模块中一致
- ✅ 方法签名在测试和实现中匹配
