# latte-ts-models 项目文档

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

---

## 二、快速开始

### 安装

```bash
npm install latte-ts-models
```

### 依赖

```json
{
  "@anthropic-ai/sdk": "^0.39.0"
}
```

### 基本使用

```typescript
import { AIClient } from 'latte-ts-models';

// 方式一：直接传入配置（推荐）
const ai = new AIClient({
  providers: {
    aiproxy: {
      baseURL: 'https://api.aiproxy.com/v1',
      authToken: 'your-token',
      authType: 'authToken',
      models: ['glm-5.1', 'gpt-4o']
    },
    anthropic: {
      baseURL: 'https://api.anthropic.com',
      authToken: 'sk-ant-xxx',
      authType: 'apiKey',
      models: ['claude-sonnet-4-20250514']
    }
  }
});

// 单轮查询
const answer = await ai.query('你好');
console.log(answer);

// 多轮对话
const response = await ai.chat([
  { role: 'user', content: '第一轮问题' },
  { role: 'assistant', content: '第一轮回复' },
  { role: 'user', content: '第二轮问题' }
], { maxTokens: 4096 });

// 指定 Provider 和模型
const result = await ai.query('hello', { model: 'aiproxy/glm-5.1' });
```

---

## 三、配置方式

配置加载按优先级顺序：

```
直接传入配置 > 项目配置文件 > 全局配置文件 > 环境变量
```

### 1. 直接传入配置

```typescript
const ai = new AIClient({
  providers: {
    aiproxy: {
      baseURL: 'https://api.aiproxy.com/v1',
      authToken: 'xxx',
      authType: 'authToken',
      models: ['glm-5.1']
    }
  }
});
```

### 2. 项目配置文件

路径：`.latte/models_config.json`

```json
{
  "providers": {
    "aiproxy": {
      "baseURL": "https://api.aiproxy.com/v1",
      "authToken": "your-token",
      "authType": "authToken",
      "models": ["glm-5.1", "gpt-4o"]
    }
  }
}
```

### 3. 全局配置文件

路径：`~/.latte_models/config.json`

### 4. 环境变量

```bash
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

---

## 四、API 方法详解

### AIClient 类

#### 构造函数

```typescript
new AIClient(options?: {
  providers?: Record<string, ProviderConfig>;
  configPath?: string;
  logger?: Logger;
})
```

#### chat() — 多轮对话

```typescript
async chat(
  messages: ChatMessage[],
  options?: ChatOptions,
  logger?: Logger
): Promise<ChatResponse>
```

**参数说明：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `messages` | `ChatMessage[]` | 消息数组，每条包含 `role` 和 `content` |
| `options.model` | `string` | 模型标识，支持 `"provider/model"` 格式 |
| `options.maxTokens` | `number` | 最大生成 Token 数，默认 4096 |
| `options.systemPrompt` | `string` | 系统提示词 |

**返回值 ChatResponse：**

```typescript
interface ChatResponse {
  text: string;              // 回复文本
  stopReason: string | null; // 'end_turn' | 'max_tokens' | null
  model: string;             // 实际使用的模型名
  usage?: Usage;             // Token 用量统计
}
```

#### query() — 单轮查询

```typescript
async query(
  prompt: string,
  options?: ChatOptions,
  logger?: Logger
): Promise<string>
```

等价于 `chat([{ role: 'user', content: prompt }])`，只返回纯文本。

#### chatWithTools() — Tool Use

```typescript
async chatWithTools(
  messages: ToolUseMessage[],
  options: ToolUseOptions,
  logger?: Logger
): Promise<ToolUseResponse>
```

**特性：**
- 使用流式模式避免 Anthropic SDK 的 10 分钟非流式警告
- 支持多轮对话续写（通过 `rawBlocks`）
- 自动解析 `tool_use` blocks

#### extractJson() — JSON 提取

```typescript
extractJson(text: string): any
```

处理 LLM 输出中的常见格式问题：

| 问题 | 处理方式 |
|------|---------|
| markdown 代码块 | `\`\`\`json {...} \`\`\`` → `{...}` |
| 尾逗号 | `{"a":1,}` → `{"a":1}` |
| 单行注释 | `// comment` → 去除 |
| 前缀/后缀文字 | 定位配对花括号 |

#### getUsageStats() — 用量统计

```typescript
getUsageStats(): UsageStats
```

返回累积的调用统计数据。

#### resetUsageStats() — 重置统计

```typescript
resetUsageStats(): void
```

---

## 五、核心类型定义

### ProviderConfig

```typescript
interface ProviderConfig {
  baseURL: string;                              // API 服务地址
  authToken?: string;                           // 认证令牌
  authType: 'apiKey' | 'authToken';             // 认证方式
  models: string[] | Record<string, ModelConfig>; // 可用模型
  maxTokens?: number;                           // 最大 Token 限制
}
```

### ModelConfig

```typescript
interface ModelConfig {
  useStream?: boolean;          // 是否强制流式模式
  contextWindow?: number;       // 上下文窗口大小
  maxOutputTokens?: number;     // 最大输出 Token
  supportsToolUse?: boolean;    // 是否支持 Tool Use
  timeout?: number;             // 请求超时时间
}
```

### ChatMessage

```typescript
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
```

### UsageStats

```typescript
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

### 错误类型

```typescript
class NetworkError extends Error { }   // 网络错误（无状态码）
class HttpError extends Error {        // HTTP 错误（有状态码）
  status: number;
}
class RateLimitError extends HttpError { } // 限流错误（429）
class NonRetryableError extends Error { }  // 不可重试错误
```

---

## 六、内部模块详解

### 1. provider-resolver.ts — Provider 路由

**核心函数：**

| 函数 | 说明 |
|------|------|
| `parseModelRef(modelRef)` | 解析 `"provider/model"` 格式 |
| `findProviderConfig(providers, providerName, modelName)` | 查找并验证 Provider |
| `resolveProvider(modelRef, providers, defaultProviderName)` | 完整路由解析 |
| `guessDefaultProvider(providers)` | 推断默认 Provider |

**解析流程：**

```
输入: "aiproxy/glm-5.1"
  ↓ parseModelRef
{ providerName: 'aiproxy', modelName: 'glm-5.1' }
  ↓ findProviderConfig
验证模型是否在 aiproxy.models 中
  ↓ 返回
{ providerConfig: {...}, modelName: 'glm-5.1' }
```

### 2. retry.ts — 自动重试

**错误分类策略：**

| 分类 | 条件 | 最大重试次数 |
|------|------|------------|
| `network` | 无 HTTP 状态码（如 ECONNREFUSED） | 3 次 |
| `http` | 有状态码（含 400/429/500） | 20 次 |

**核心原则：只要服务端返回了 HTTP 状态码，就值得重试。**

```typescript
function classifyError(error: any): 'network' | 'http'
function executeWithRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>
```

### 3. backoff.ts — 指数退避

**算法公式：**

```
delay = 500ms * 2^n + jitter (0-99ms)
上限 = 24 小时 = 86,400,000 ms
```

**退避曲线示例：**

| n | 基础延迟 | 加 jitter 后 |
|---|---------|-------------|
| 0 | 500ms | 500-600ms |
| 1 | 1000ms | 1000-1100ms |
| 2 | 2000ms | 2000-2100ms |
| 3 | 4000ms | 4000-4100ms |

### 4. json-extractor.ts — JSON 提取

**提取流程（按优先级）：**

```
1. 直接解析 → 成功则返回
2. 去除 markdown 代码块 → 解析
3. 定位花括号 { → } → 解析
4. 去除注释 + 修复尾逗号 → 解析
5. 贪婪匹配 {...} → 解析
6. 所有失败 → 返回 {}
```

### 5. config.ts — 配置加载

**加载流程：**

```
loadProviders(options)
  ↓
检查 options.providers（直接传入）
  ↓ 无则继续
loadProjectConfigProviders() → .latte/models_config.json
  ↓ 无则继续
loadGlobalConfigProviders() → ~/.latte_models/config.json
  ↓ 无则继续
loadEnvProviders() → ANTHROPIC_API_KEY
  ↓ 无配置
抛出错误
```

---

## 七、测试说明

### 测试文件结构

```
__tests__/
├── ai-client.test.js      # AIClient 核心类测试
├── backoff.test.js        # 指数退避测试
├── config.test.js         # 配置加载测试
├── json-extractor.test.js # JSON 提取测试
├── provider-resolver.test.js # Provider 路由测试
├── retry.test.js          # 自动重试测试
├── types.test.js          # 类型定义测试
```

### 运行测试

```bash
npm test              # 运行所有测试
npm run test:watch    # 监听模式
```

### 测试覆盖范围

#### ai-client.test.js

| 测试项 | 说明 |
|-------|------|
| 构造函数 | 三种配置方式、默认模型设置 |
| extractJson() | markdown 包裹、尾逗号修复、空对象兜底 |
| query() | 返回纯文本、模型路由、默认模型 |
| chat() | ChatResponse 结构、systemPrompt、多轮对话、maxTokens |

#### backoff.test.js

| 测试项 | 说明 |
|-------|------|
| 基础功能 | n=0/1/2/3 的退避时间范围 |
| 边界条件 | 大 n 值上限 24h |
| 随机性 | jitter 有效性 |
| 错误处理 | 负数、小数、非数字输入 |
| formatDelay() | 时间格式化 |

#### config.test.js

| 测试项 | 说明 |
|-------|------|
| loadEnvProviders() | 环境变量加载 |
| loadConfigProviders() | 配置文件加载、解析失败处理 |
| mergeProviders() | 优先级合并 |
| loadProviders() | 完整加载流程 |

#### json-extractor.test.js

| 测试项 | 说明 |
|-------|------|
| stripMarkdownCodeBlock() | `\`\`\`json` 去除 |
| fixTrailingCommas() | 对象/数组尾逗号修复 |
| stripSingleLineComments() | 单行注释去除 |
| findBalancedBraces() | 花括号定位、嵌套处理 |
| extractJson() | 组合策略测试 |

#### provider-resolver.test.js

| 测试项 | 说明 |
|-------|------|
| parseModelRef() | 格式解析、纯模型名、边界情况 |
| isModelAvailable() | 数组/Set 查找 |
| findProviderConfig() | Provider 查找、模型验证、错误信息 |
| resolveProvider() | 完整路由 |
| guessDefaultProvider() | 默认推断 |

#### retry.test.js

| 测试项 | 说明 |
|-------|------|
| classifyError() | NetworkError/HttpError/RateLimitError 分类 |
| executeWithRetry() | 成功返回、网络错误重试、HTTP 错误重试、混合错误 |

#### types.test.js

| 测试项 | 说明 |
|-------|------|
| Usage | 字段完整性 |
| ChatMessage | user/assistant 角色 |
| ChatResponse | stopReason 类型 |
| ChatOptions | 所有字段可选 |
| ProviderConfig | 认证方式 |
| RetryOptions | 兼容旧字段 |
| 错误类型 | 继承关系 |
| noopLogger | 静默不抛错 |

---

## 八、使用示例

### 示例 1：基本聊天

```typescript
import { AIClient } from 'latte-ts-models';

const ai = new AIClient({
  providers: {
    anthropic: {
      baseURL: 'https://api.anthropic.com',
      authToken: process.env.ANTHROPIC_API_KEY!,
      authType: 'apiKey',
      models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001']
    }
  }
});

// 单轮
const answer = await ai.query('什么是闭包？');

// 多轮
const response = await ai.chat([
  { role: 'user', content: '写一个 TypeScript 函数' },
  { role: 'assistant', content: '好的，请问什么功能？' },
  { role: 'user', content: '计算斐波那契数列' }
], {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 2048,
  systemPrompt: '你是一个编程助手'
});

console.log(response.text);
console.log(`使用 ${response.usage?.inputTokens} 输入 + ${response.usage?.outputTokens} 输出 Token`);
```

### 示例 2：JSON 提取

```typescript
const ai = new AIClient({...});

const llmOutput = `
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

const data = ai.extractJson(llmOutput);
// data = { name: "test", items: [1, 2, 3], config: { enabled: true } }
```

### 示例 3：Tool Use

```typescript
const response = await ai.chatWithTools(
  [{ role: 'user', content: '修改文件内容' }],
  {
    model: 'claude-sonnet-4-20250514',
    tools: [{
      name: 'file_edit',
      description: '编辑文件内容',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '新内容' }
        },
        required: ['path', 'content']
      }
    }],
    systemPrompt: '你是代码编辑助手',
    timeout: 300000  // 5 分钟
  }
);

if (response.done) {
  console.log('任务完成，无工具调用');
} else {
  for (const call of response.toolCalls) {
    console.log(`工具: ${call.name}, 参数: ${JSON.stringify(call.input)}`);
  }
}
```

### 示例 4：用量统计

```typescript
const ai = new AIClient({...});

// 执行多次调用
await ai.query('问题1');
await ai.query('问题2');
await ai.query('问题3');

// 获取统计
const stats = ai.getUsageStats();
console.log(`总调用: ${stats.totalCalls}`);
console.log(`总 Token: ${stats.totalTokens}`);
console.log(`输入 Token: ${stats.totalInputTokens}`);
console.log(`输出 Token: ${stats.totalOutputTokens}`);

// 查看各模型统计
for (const [model, data] of Object.entries(stats.byModel)) {
  console.log(`${model}: ${data.calls} 次调用, ${data.inputTokens + data.outputTokens} Token`);
}

// 重置统计
ai.resetUsageStats();
```

---

## 九、架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         AIClient                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   query()   │  │   chat()    │  │   chatWithTools()   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│         │               │                    │               │
│         └───────────────┼────────────────────┘               │
│                         ↓                                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                  resolveModel()                          ││
│  │  解析 "provider/model" → 确定 client + model + maxTokens ││
│  └─────────────────────────────────────────────────────────┘│
│                         ↓                                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                  withRetry()                             ││
│  │  自动重试 + 指数退避                                      ││
│  └─────────────────────────────────────────────────────────┘│
│                         ↓                                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Anthropic SDK Client                        ││
│  │  messages.create() / messages.create(stream: true)       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌───────────────┐
│ provider-resolver│    │     retry       │    │    backoff    │
│  parseModelRef  │    │ classifyError   │    │ calculateBackoff│
│  resolveProvider│    │executeWithRetry │    │  formatDelay  │
└─────────────────┘    └─────────────────┘    └───────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌───────────────┐
│     config      │    │  json-extractor │    │    types      │
│  loadProviders  │    │   extractJson   │    │ ProviderConfig│
│  mergeProviders │    │stripMarkdown... │    │  ChatMessage  │
└─────────────────┘    └─────────────────┘    │  ChatResponse │
                                              └───────────────┘
```

---

## 十、注意事项

1. **认证方式选择**
   - `apiKey`：Anthropic 官方 API，使用 `X-Api-Key` 头
   - `authToken`：代理服务，使用 `Authorization: Bearer` 头

2. **重试策略**
   - 网络错误（无响应）：最多 3 次
   - HTTP 错误（有响应）：最多 20 次，包括 400/500 等状态码
   - 原因：有状态码说明服务端可通信，可能是临时问题

3. **流式模式**
   - 模型配置 `useStream: true` 时自动启用
   - 避免 Anthropic SDK 的 10 分钟非流式请求警告

4. **JSON 提取**
   - 失败时返回空对象 `{}`，不会抛错
   - 支持尾逗号、注释、markdown 包裹的修复

5. **用量统计**
   - 自动累积，手动调用 `resetUsageStats()` 重置
   - 按模型分组统计
