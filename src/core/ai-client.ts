import { UsageStats, Usage, ProviderConfig } from '../types/types';
import { loadProviders, LoadProvidersOptions } from '../config/config';
import { extractJson as extractJsonUtil } from '../utils/json-extractor';

/**
 * AIClient 构造函数选项
 */
export interface AIClientOptions extends LoadProvidersOptions {
  // 可以扩展其他选项
}

/**
 * AI 客户端
 *
 * 提供统一的 AI 模型调用接口，支持多 Provider 配置
 */
export class AIClient {
  /** Provider 配置映射 */
  private providers: Record<string, ProviderConfig>;

  /** 用量统计 */
  private usageStats: UsageStats;

  /**
   * 构造函数
   *
   * @param options - 客户端选项
   */
  constructor(options: AIClientOptions = {}) {
    // 加载配置
    this.providers = loadProviders(options);

    // 初始化用量统计
    this.usageStats = this.createEmptyUsageStats();
  }

  /**
   * 创建空的用量统计对象
   *
   * @returns 空的用量统计
   */
  private createEmptyUsageStats(): UsageStats {
    return {
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
   * 从文本中提取 JSON
   *
   * @param text - 包含 JSON 的文本
   * @returns 解析后的 JSON 对象，失败时返回空对象
   */
  extractJson(text: string): any {
    return extractJsonUtil(text);
  }

  /**
   * 获取用量统计
   *
   * @returns 用量统计的副本
   */
  getUsageStats(): UsageStats {
    // 返回深拷贝，防止外部修改
    return JSON.parse(JSON.stringify(this.usageStats));
  }

  /**
   * 重置用量统计
   */
  resetUsageStats(): void {
    this.usageStats = this.createEmptyUsageStats();
  }

  /**
   * 更新用量统计
   *
   * @param model - 模型名称
   * @param usage - Token 用量
   */
  private updateUsageStats(model: string, usage: Usage): void {
    // 更新总计
    this.usageStats.totalCalls++;
    this.usageStats.totalInputTokens += usage.inputTokens;
    this.usageStats.totalOutputTokens += usage.outputTokens;
    this.usageStats.totalTokens += usage.inputTokens + usage.outputTokens;

    // 更新按模型统计
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
}
