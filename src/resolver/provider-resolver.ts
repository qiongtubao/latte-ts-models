import type { ProviderConfig } from '../types/types';

/**
 * 模型引用解析结果
 */
export interface ModelRef {
  providerName?: string;  // Provider 名称（可选）
  modelName: string;      // 模型名称
}

/**
 * Provider 解析结果
 */
export interface ResolvedProvider {
  providerName: string;       // Provider 名称
  modelName: string;          // 模型名称
  config: ProviderConfig;     // Provider 配置
}

/**
 * 解析模型引用字符串
 * 支持格式: "provider/model" 或 "model"
 *
 * @param modelRef - 模型引用字符串
 * @returns 解析结果
 */
export function parseModelRef(modelRef: string): ModelRef {
  const slashIndex = modelRef.indexOf('/');

  // 如果没有斜杠，则只有模型名
  if (slashIndex === -1) {
    return {
      providerName: undefined,
      modelName: modelRef,
    };
  }

  // 分割 provider 和 model（只取第一个斜杠）
  const providerName = modelRef.substring(0, slashIndex);
  const modelName = modelRef.substring(slashIndex + 1);

  return {
    providerName,
    modelName,
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
  models: string[] | Record<string, any>,
  modelName: string
): boolean {
  if (Array.isArray(models)) {
    return models.includes(modelName);
  }

  if (typeof models === 'object' && models !== null) {
    return modelName in models;
  }

  return false;
}

/**
 * 查找 Provider 配置
 *
 * @param providers - Provider 配置映射
 * @param providerName - Provider 名称
 * @param modelName - 可选的模型名称（用于验证）
 * @returns Provider 配置或 undefined
 */
export function findProviderConfig(
  providers: Record<string, ProviderConfig>,
  providerName: string,
  modelName?: string
): ProviderConfig | undefined {
  const config = providers[providerName];

  // Provider 不存在
  if (!config) {
    return undefined;
  }

  // 如果指定了模型名，验证模型是否可用
  if (modelName !== undefined) {
    if (!isModelAvailable(config.models, modelName)) {
      return undefined;
    }
  }

  return config;
}

/**
 * 推断默认 Provider
 * 返回第一个可用的 Provider
 *
 * @param providers - Provider 配置映射
 * @returns 默认 Provider 名称或 undefined
 */
export function guessDefaultProvider(
  providers: Record<string, ProviderConfig>
): string | undefined {
  const providerNames = Object.keys(providers);
  return providerNames.length > 0 ? providerNames[0] : undefined;
}

/**
 * 解析 Provider 路由
 *
 * @param modelRef - 模型引用（"provider/model" 或 "model"）
 * @param providers - Provider 配置映射
 * @param defaultProviderName - 可选的默认 Provider 名称
 * @returns 解析结果
 * @throws Error 如果无法解析
 */
export function resolveProvider(
  modelRef: string,
  providers: Record<string, ProviderConfig>,
  defaultProviderName?: string
): ResolvedProvider {
  // 解析模型引用
  const { providerName: parsedProvider, modelName } = parseModelRef(modelRef);

  // 情况 1: 明确指定了 provider
  if (parsedProvider) {
    const config = findProviderConfig(providers, parsedProvider, modelName);

    if (!config) {
      // 检查是 provider 不存在还是模型不可用
      if (!providers[parsedProvider]) {
        throw new Error(`Provider "${parsedProvider}" 不存在`);
      }
      throw new Error(`模型 "${modelName}" 在 provider "${parsedProvider}" 中不可用`);
    }

    return {
      providerName: parsedProvider,
      modelName,
      config,
    };
  }

  // 情况 2: 没有指定 provider，使用默认值
  const providerName = defaultProviderName ?? guessDefaultProvider(providers);

  if (!providerName) {
    // 没有默认 provider，尝试在所有 provider 中查找模型
    for (const [name, config] of Object.entries(providers)) {
      if (isModelAvailable(config.models, modelName)) {
        return {
          providerName: name,
          modelName,
          config,
        };
      }
    }

    throw new Error(`无法找到包含模型 "${modelName}" 的 provider`);
  }

  // 使用指定的默认 provider
  const config = findProviderConfig(providers, providerName, modelName);

  if (!config) {
    throw new Error(`模型 "${modelName}" 在 provider "${providerName}" 中不可用`);
  }

  return {
    providerName,
    modelName,
    config,
  };
}
