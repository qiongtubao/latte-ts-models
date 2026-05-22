# latte-ts-models 实现设计文档

## 一、项目概述

`latte-ts-models` 是一个基于 Anthropic SDK 的多 Provider AI 客户端库，提供统一的 API 接口用于调用多个 AI 服务提供商。

### 核心功能

| 功能模块 | 说明 |
|---------|------|
| **多 Provider 路由** | 支持 `"provider/model"` 格式指定服务提供商和模型 |
| **自动重试** | 网络错误最多重试 3 次，HTTP 错误最多重试 20 次 |
| **指数退避** | `500ms * 2^n + jitter` 算法，上限 24 小时 |
| **JSON 提取** | 处理 LLM 输出中的 markdown 代码块、尾逗号、注释等问题 |
| **多种配置方式** | 支持直接传入、配置文件、环境变量三种配置方式 |
| **Tool Use 支持** | 支持流式模式的 Tool Use API，避免 10 分钟超时警告 |
| **用量统计** | 自动统计调用次数和 Token 消耗 |

### 技术选型

- **语言**: TypeScript
- **测试框架**: Jest
- **编译输出**: CommonJS + ESM 双格式
- **核心依赖**: @anthropic-ai/sdk

---

## 二、项目结构

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
├── jest.config.js
└── latte.md                        # 项目文档
```

### 目录说明

- **`src/types/`**: 所有类型定义集中管理，包括接口、类型别名、错误类
- **`src/utils/`**: 工具函数模块，提供重试、退避、JSON 提取等功能
- **`src/config/`**: 配置加载模块，处理多种配置来源
- **`src/resolver/`**: Provider 路由模块，解析和验证模型引用
- **`src/core/`**: AIClient 主类，组装所有模块提供统一 API

---

## 三、模块详细设计

### 3.1 类型定义模块 (`src/types/types.ts`)

#### 核心类型

```typescript
/**
 * Provider 配置
 */
interface ProviderConfig {
  baseURL: string;                              // API 服务地址
  authToken?: string;                           // 认证令牌
  authType: 'apiKey' | 'authToken';             // 认证方式
  models: string[] | Record<string, ModelConfig>; // 可用模型
  maxTokens?: number;                           // 最大 Token 限制
}

/**
 * 模型配置
 */
interface ModelConfig {
  useStream?: boolean;          // 是否强制流式模式
  contextWindow?: number;       // 上下文窗口大小
  maxOutputTokens?: number;     // 最大输出 Token
  supportsToolUse?: boolean;    // 是否支持 Tool Use
  timeout?: number;             // 请求超时时间
}

/**
 * 聊天消息
 */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * 聊天响应
 */
interface ChatResponse {
  text: string;              // 回复文本
  stopReason: string | null; // 'end_turn' | 'max_tokens' | null
  model: string;             // 实际使用的模型名
  usage?: Usage;             // Token 用量统计
}

/**
 * 聊天选项
 */
interface ChatOptions {
  model?: string;            // 模型标识，支持 "provider/model" 格式
  maxTokens?: number;        // 最大生成 Token 数
  systemPrompt?: string;     // 系统提示词
}

/**
 * Token 用量
 */
interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * 用量统计
 */
interface UsageStats {
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
```

#### 错误类型

```typescript
/**
 * 网络错误（无状态码）
 */
class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * HTTP 错误（有状态码）
 */
class HttpError extends Error {
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
class RateLimitError extends HttpError {
  constructor(message: string) {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * 不可重试错误
 */
class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}
```

#### 日志接口

```typescript
/**
 * 日志接口
 */
interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}
```

---

### 3.2 工具模块

#### 3.2.1 退避算法 (`src/utils/backoff.ts`)

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

  const delay = baseDelay * Math.pow(2, n) + jitter;
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

#### 3.2.2 重试逻辑 (`src/utils/retry.ts`)

```typescript
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
  // 实现细节：
  // 1. 执行 fn()
  // 2. 失败时根据错误类型获取最大重试次数
  // 3. 调用 calculateBackoff 计算延迟
  // 4. 等待后重试
  // 5. 达到最大重试次数后抛出错误
}
```

#### 3.2.3 JSON 提取 (`src/utils/json-extractor.ts`)

```typescript
/**
 * 从文本中提取 JSON 对象
 *
 * @param text - 包含 JSON 的文本
 * @returns 解析后的对象，失败时返回 {}
 */
export function extractJson(text: string): any {
  // 提取流程：
  // 1. 直接解析 → 成功则返回
  // 2. 去除 markdown 代码块 → 解析
  // 3. 定位花括号 → 解析
  // 4. 去除注释 + 修复尾逗号 → 解析
  // 5. 所有失败 → 返回 {}
}

/**
 * 去除 markdown 代码块标记
 */
function stripMarkdownCodeBlock(text: string): string {
  // 匹配 ```json {...} ``` 或 ``` {...} ```
}

/**
 * 修复尾逗号
 */
function fixTrailingCommas(text: string): string {
  // {"a":1,} → {"a":1}
  // [1,2,] → [1,2]
}

/**
 * 去除单行注释
 */
function stripSingleLineComments(text: string): string {
  // // comment → 去除
}

/**
 * 查找配对的花括号
 */
function findBalancedBraces(text: string): string | null {
  // 定位第一个 { 和最后一个 }
  // 处理嵌套情况
}
```

---

### 3.3 配置模块 (`src/config/config.ts`)

```typescript
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
  // 实现细节：
  // 1. 检查 options.providers（直接传入）
  // 2. 无则继续：loadProjectConfigProviders() → .latte/models_config.json
  // 3. 无则继续：loadGlobalConfigProviders() → ~/.latte_models/config.json
  // 4. 无则继续：loadEnvProviders() → 环境变量
  // 5. 无配置时抛出错误
}

/**
 * 从项目配置文件加载
 */
function loadProjectConfigProviders(): Record<string, ProviderConfig> | null {
  // 读取 .latte/models_config.json
}

/**
 * 从全局配置文件加载
 */
function loadGlobalConfigProviders(): Record<string, ProviderConfig> | null {
  // 读取 ~/.latte_models/config.json
}

/**
 * 从环境变量加载
 */
function loadEnvProviders(): Record<string, ProviderConfig> | null {
  // 读取 ANTHROPIC_API_KEY、ANTHROPIC_BASE_URL、ANTHROPIC_MODEL
}

/**
 * 合并多个配置源
 */
function mergeProviders(
  ...configs: (Record<string, ProviderConfig> | null)[]
): Record<string, ProviderConfig> {
  // 按优先级合并，高优先级覆盖低优先级
}
```

---

### 3.4 Provider 路由模块 (`src/resolver/provider-resolver.ts`)

```typescript
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
  // 按第一个 "/" 分割
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
  // 数组：includes 检查
  // 对象：hasOwnProperty 检查
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
  // 1. 根据 providerName 查找 ProviderConfig
  // 2. 验证 modelName 是否在该 Provider 的 models 中
  // 3. 返回结果或 null
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
  // 解析流程：
  // 1. parseModelRef 解析模型引用
  // 2. 如果有 providerName，直接 findProviderConfig
  // 3. 如果无 providerName，遍历所有 Provider 查找模型
  // 4. 找不到则使用 defaultProviderName
  // 5. 最终找不到抛出错误
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
  // 如果只有一个 Provider，返回其名称
  // 否则返回 null
}
```

---

### 3.5 AIClient 主类 (`src/core/ai-client.ts`)

```typescript
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
    // 1. 通过 loadProviders 加载配置
    // 2. 通过 guessDefaultProvider 推断默认 Provider
    // 3. 初始化用量统计
  }

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
    // 等价于 chat([{ role: 'user', content: prompt }])
    // 只返回 text 字段
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
    // 1. resolveModel 解析模型配置
    // 2. createAnthropicClient 创建客户端
    // 3. executeWithRetry 包装 API 调用
    // 4. updateUsageStats 更新统计
    // 5. 返回 ChatResponse
  }

  /**
   * Tool Use 对话
   *
   * @param messages - 消息数组
   * @param options - Tool Use 选项
   * @param logger - 日志记录器
   * @returns Tool Use 响应
   */
  async chatWithTools(
    messages: ToolUseMessage[],
    options: ToolUseOptions,
    logger?: Logger
  ): Promise<ToolUseResponse> {
    // 1. 使用流式模式避免 10 分钟超时
    // 2. 自动解析 tool_use blocks
    // 3. 支持多轮对话续写（通过 rawBlocks）
  }

  /**
   * 提取 JSON 对象
   *
   * @param text - 包含 JSON 的文本
   * @returns 解析后的对象
   */
  extractJson(text: string): any {
    // 直接调用 utils/extractJson
  }

  /**
   * 获取用量统计
   */
  getUsageStats(): UsageStats {
    // 返回累积的统计数据
  }

  /**
   * 重置用量统计
   */
  resetUsageStats(): void {
    // 清空统计数据
  }

  /**
   * 解析模型配置（私有）
   */
  private resolveModel(modelRef?: string): {
    client: Anthropic;
    model: string;
    maxTokens: number;
  } {
    // 1. resolveProvider 获取配置
    // 2. createAnthropicClient 创建客户端
    // 3. 确定 maxTokens
  }

  /**
   * 创建 Anthropic 客户端（私有）
   */
  private createAnthropicClient(config: ProviderConfig): Anthropic {
    // 根据 authType 设置不同的认证头
    // apiKey: X-Api-Key
    // authToken: Authorization: Bearer
  }

  /**
   * 更新用量统计（私有）
   */
  private updateUsageStats(model: string, usage: Usage): void {
    // 累积统计
    // 按 model 分组
  }
}
```

---

## 四、依赖关系

```
AIClient (src/core/ai-client.ts)
  ├── loadProviders (src/config/config.ts)
  ├── resolveProvider (src/resolver/provider-resolver.ts)
  ├── executeWithRetry (src/utils/retry.ts)
  │     └── calculateBackoff (src/utils/backoff.ts)
  └── extractJson (src/utils/json-extractor.ts)
```

**模块加载顺序：**
1. `types/types.ts` - 无依赖，最先加载
2. `utils/backoff.ts` - 依赖 types
3. `utils/retry.ts` - 依赖 backoff + types
4. `utils/json-extractor.ts` - 无依赖
5. `config/config.ts` - 依赖 types
6. `resolver/provider-resolver.ts` - 依赖 types
7. `core/ai-client.ts` - 依赖所有模块
8. `index.ts` - 导出所有公开 API

---

## 五、入口文件设计 (`src/index.ts`)

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
  ToolUseMessage,
  ToolUseOptions,
  ToolUseResponse,
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

---

## 六、配置文件设计

### 6.1 package.json

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

### 6.2 tsconfig.json

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

### 6.3 jest.config.js

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

---

## 七、测试策略

### 7.1 测试覆盖范围

| 测试文件 | 覆盖内容 |
|---------|---------|
| `types.test.ts` | 类型完整性、错误类继承 |
| `backoff.test.ts` | 退避计算、边界条件、格式化 |
| `retry.test.ts` | 错误分类、重试逻辑、最大次数 |
| `json-extractor.test.ts` | 各种 JSON 格式提取、边界情况 |
| `config.test.ts` | 配置加载、优先级、合并 |
| `provider-resolver.test.ts` | 模型引用解析、路由、默认推断 |
| `ai-client.test.ts` | 构造函数、所有公开方法、集成测试 |

### 7.2 Mock 策略

- **Anthropic SDK**: Mock `messages.create()` 方法
- **文件系统**: Mock `fs.readFileSync()` 和 `fs.existsSync()`
- **环境变量**: 使用 `process.env` 临时修改
- **网络请求**: 不发起真实请求，全部 Mock

---

## 八、代码规范

### 8.1 注释规范

- 所有函数、类、接口添加中文注释
- 复杂逻辑添加行内注释说明
- 使用 JSDoc 格式

### 8.2 命名规范

- 类名：PascalCase（如 `AIClient`）
- 函数名：camelCase（如 `loadProviders`）
- 私有方法：下划线前缀（如 `_resolveModel`）
- 常量：UPPER_SNAKE_CASE（如 `MAX_DELAY`）

### 8.3 文件命名

- 源文件：kebab-case（如 `ai-client.ts`）
- 测试文件：对应源文件名 + `.test.ts`

---

## 九、实现顺序

建议按以下顺序实现：

1. **基础配置文件**
   - `package.json`
   - `tsconfig.json`
   - `jest.config.js`

2. **类型定义**
   - `src/types/types.ts`
   - `src/types/types.test.ts`

3. **工具模块**
   - `src/utils/backoff.ts` + 测试
   - `src/utils/retry.ts` + 测试
   - `src/utils/json-extractor.ts` + 测试

4. **配置模块**
   - `src/config/config.ts` + 测试

5. **路由模块**
   - `src/resolver/provider-resolver.ts` + 测试

6. **核心模块**
   - `src/core/ai-client.ts` + 测试

7. **入口文件**
   - `src/index.ts`

8. **集成测试**
   - 完整流程测试

---

## 十、后续扩展方向

### 10.1 功能增强
- 添加更多 Provider 支持（OpenAI、Google 等）
- 实现请求缓存机制
- 支持流式响应的实时处理

### 10.2 开发体验
- 提供更详细的错误信息和调试工具
- 添加 VSCode 调试配置
- 完善文档和示例

### 10.3 性能优化
- 实现请求取消功能
- 优化超时控制
- 添加并发请求管理
