import { ProviderConfig } from '../types/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * loadProviders 函数的选项
 */
export interface LoadProvidersOptions {
  providers?: Record<string, ProviderConfig>; // 直接提供的 provider 配置
}

/**
 * 配置文件结构
 */
interface ConfigFile {
  providers?: Record<string, ProviderConfig>;
}

/**
 * 加载 provider 配置
 *
 * 优先级: 直接配置 > 项目配置 > 全局配置 > 环境变量
 *
 * @param options 加载选项
 * @returns provider 配置映射
 */
export function loadProviders(options: LoadProvidersOptions = {}): Record<string, ProviderConfig> {
  const result: Record<string, ProviderConfig> = {};

  // 1. 从环境变量加载 (最低优先级)
  loadFromEnv(result);

  // 2. 从全局配置文件加载
  loadFromGlobalConfig(result);

  // 3. 从项目配置文件加载
  loadFromProjectConfig(result);

  // 4. 从直接配置加载 (最高优先级)
  if (options.providers) {
    Object.assign(result, options.providers);
  }

  return result;
}

/**
 * 从环境变量加载配置
 */
function loadFromEnv(result: Record<string, ProviderConfig>): void {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  const model = process.env.ANTHROPIC_MODEL;

  if (apiKey) {
    result.anthropic = {
      baseURL: baseURL || 'https://api.anthropic.com',
      authType: 'apiKey',
      authToken: apiKey,
      models: model ? [model] : ['claude-sonnet-4-20250514'],
    };
  }

  // OpenAI 环境变量
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (openaiApiKey) {
    const openaiBaseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
    const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';
    result.openai = {
      baseURL: openaiBaseURL,
      authType: 'apiKey',
      authToken: openaiApiKey,
      protocol: 'openai',
      models: [openaiModel],
    };
  }
}

/**
 * 从全局配置文件加载
 * 路径: ~/.latte_models/config.json
 */
function loadFromGlobalConfig(result: Record<string, ProviderConfig>): void {
  const globalConfigPath = path.join(os.homedir(), '.latte_models', 'config.json');
  loadFromConfigFile(globalConfigPath, result);
}

/**
 * 从项目配置文件加载
 * 路径: .latte/models_config.json
 */
function loadFromProjectConfig(result: Record<string, ProviderConfig>): void {
  const projectConfigPath = path.join(process.cwd(), '.latte', 'models_config.json');
  loadFromConfigFile(projectConfigPath, result);
}

/**
 * 从配置文件加载配置
 *
 * @param configPath 配置文件路径
 * @param result 结果对象,会被修改
 */
function loadFromConfigFile(configPath: string, result: Record<string, ProviderConfig>): void {
  if (!fs.existsSync(configPath)) {
    return;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config: ConfigFile = JSON.parse(content);

    if (config.providers) {
      // 验证并合并有效的 provider 配置
      for (const [name, providerConfig] of Object.entries(config.providers)) {
        if (isValidProviderConfig(providerConfig)) {
          result[name] = providerConfig;
        }
      }
    }
  } catch (error) {
    // 配置文件解析错误,抛出异常
    throw new Error(`配置文件解析失败: ${configPath}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 验证 provider 配置是否有效
 *
 * @param config provider 配置
 * @returns 是否有效
 */
function isValidProviderConfig(config: any): config is ProviderConfig {
  return (
    config &&
    typeof config === 'object' &&
    typeof config.baseURL === 'string' &&
    (config.authType === 'apiKey' || config.authType === 'authToken') &&
    (Array.isArray(config.models) || (typeof config.models === 'object' && config.models !== null))
  );
}
