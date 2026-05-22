import { loadProviders, LoadProvidersOptions } from './config';
import { ProviderConfig } from '../types/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock fs, path, os 模块
jest.mock('fs');
jest.mock('path');
jest.mock('os');

describe('配置加载模块', () => {
  let mockFs: jest.Mocked<typeof fs>;
  let mockPath: jest.Mocked<typeof path>;
  let mockOs: jest.Mocked<typeof os>;
  let mockExistsSync: jest.Mock;
  let mockReadFileSync: jest.Mock;

  beforeEach(() => {
    // 重置所有 mock
    jest.clearAllMocks();

    mockFs = require('fs') as jest.Mocked<typeof fs>;
    mockPath = require('path') as jest.Mocked<typeof path>;
    mockOs = require('os') as jest.Mocked<typeof os>;

    mockExistsSync = mockFs.existsSync as jest.Mock;
    mockReadFileSync = mockFs.readFileSync as jest.Mock;

    // 默认 mock 实现
    mockOs.homedir.mockReturnValue('/home/testuser');
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.resolve.mockImplementation((...args) => args.join('/'));
  });

  describe('loadProviders', () => {
    describe('优先级: 直接配置 > 项目配置 > 全局配置 > 环境变量', () => {
      test('直接配置具有最高优先级', () => {
        // 准备: 直接配置
        const directConfig: ProviderConfig = {
          baseURL: 'https://direct.example.com',
          authType: 'apiKey',
          authToken: 'direct-key',
          models: ['direct-model'],
        };

        // 准备: 项目配置文件存在
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify({
          providers: {
            anthropic: {
              baseURL: 'https://project.example.com',
              authType: 'apiKey',
              authToken: 'project-key',
              models: ['project-model'],
            }
          }
        }));

        // 执行
        const options: LoadProvidersOptions = {
          providers: {
            anthropic: directConfig
          }
        };
        const result = loadProviders(options);

        // 验证: 使用直接配置覆盖项目配置
        expect(result.anthropic).toEqual(directConfig);
        expect(result.anthropic.baseURL).toBe('https://direct.example.com');
        expect(result.anthropic.authToken).toBe('direct-key');
      });

      test('无直接配置时使用项目配置', () => {
        // 准备: 项目配置文件存在
        const projectConfig = {
          providers: {
            anthropic: {
              baseURL: 'https://project.example.com',
              authType: 'apiKey',
              authToken: 'project-key',
              models: ['project-model'],
            }
          }
        };
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify(projectConfig));

        // 执行
        const result = loadProviders({});

        // 验证: 使用项目配置
        expect(result.anthropic).toBeDefined();
        expect(result.anthropic.baseURL).toBe('https://project.example.com');
        expect(result.anthropic.authToken).toBe('project-key');
      });

      test('无项目配置时使用全局配置', () => {
        // 准备: 项目配置不存在,全局配置存在
        mockExistsSync
          .mockReturnValueOnce(false) // 项目配置不存在
          .mockReturnValueOnce(true);  // 全局配置存在

        const globalConfig = {
          providers: {
            anthropic: {
              baseURL: 'https://global.example.com',
              authType: 'apiKey',
              authToken: 'global-key',
              models: ['global-model'],
            }
          }
        };
        mockReadFileSync.mockReturnValue(JSON.stringify(globalConfig));

        // 执行
        const result = loadProviders({});

        // 验证: 使用全局配置
        expect(result.anthropic).toBeDefined();
        expect(result.anthropic.baseURL).toBe('https://global.example.com');
        expect(result.anthropic.authToken).toBe('global-key');
      });

      test('无全局配置时使用环境变量', () => {
        // 准备: 所有配置文件都不存在
        mockExistsSync.mockReturnValue(false);

        // 准备: 环境变量
        process.env.ANTHROPIC_API_KEY = 'env-api-key';
        process.env.ANTHROPIC_BASE_URL = 'https://env.example.com';
        process.env.ANTHROPIC_MODEL = 'env-model';

        // 执行
        const result = loadProviders({});

        // 验证: 使用环境变量
        expect(result.anthropic).toBeDefined();
        expect(result.anthropic.baseURL).toBe('https://env.example.com');
        expect(result.anthropic.authToken).toBe('env-api-key');
        expect(result.anthropic.authType).toBe('apiKey');
        expect(result.anthropic.models).toEqual(['env-model']);

        // 清理
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.ANTHROPIC_BASE_URL;
        delete process.env.ANTHROPIC_MODEL;
      });

      test('直接配置覆盖项目配置中的特定 provider', () => {
        // 准备: 直接配置只提供部分 provider
        const directConfig: ProviderConfig = {
          baseURL: 'https://direct.example.com',
          authType: 'apiKey',
          authToken: 'direct-key',
          models: ['direct-model'],
        };

        // 准备: 项目配置有多个 provider
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify({
          providers: {
            anthropic: {
              baseURL: 'https://project-anthropic.example.com',
              authType: 'apiKey',
              authToken: 'project-anthropic-key',
              models: ['project-anthropic-model'],
            },
            openai: {
              baseURL: 'https://project-openai.example.com',
              authType: 'apiKey',
              authToken: 'project-openai-key',
              models: ['project-openai-model'],
            }
          }
        }));

        // 执行: 只覆盖 anthropic
        const result = loadProviders({
          providers: {
            anthropic: directConfig
          }
        });

        // 验证: anthropic 使用直接配置,openai 使用项目配置
        expect(result.anthropic).toEqual(directConfig);
        expect(result.openai).toBeDefined();
        expect(result.openai.baseURL).toBe('https://project-openai.example.com');
      });
    });

    describe('配置文件路径', () => {
      test('项目配置文件路径为 .latte/models_config.json', () => {
        mockExistsSync.mockReturnValue(false);

        loadProviders({});

        // 验证: 检查了正确的项目配置路径
        expect(mockPath.join).toHaveBeenCalledWith(expect.any(String), '.latte', 'models_config.json');
      });

      test('全局配置文件路径为 ~/.latte_models/config.json', () => {
        mockExistsSync.mockReturnValue(false);

        loadProviders({});

        // 验证: 检查了正确的全局配置路径
        expect(mockOs.homedir).toHaveBeenCalled();
        expect(mockPath.join).toHaveBeenCalledWith('/home/testuser', '.latte_models', 'config.json');
      });
    });

    describe('配置文件解析', () => {
      test('项目配置文件格式错误时抛出异常', () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('invalid json');

        expect(() => loadProviders({})).toThrow();
      });

      test('全局配置文件格式错误时抛出异常', () => {
        mockExistsSync
          .mockReturnValueOnce(false) // 项目配置不存在
          .mockReturnValueOnce(true);  // 全局配置存在

        mockReadFileSync.mockReturnValue('invalid json');

        expect(() => loadProviders({})).toThrow();
      });

      test('配置文件缺少 providers 字段时返回空对象', () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify({}));

        const result = loadProviders({});

        expect(result).toEqual({});
      });
    });

    describe('环境变量', () => {
      test('只有 ANTHROPIC_API_KEY 时使用默认值', () => {
        mockExistsSync.mockReturnValue(false);
        process.env.ANTHROPIC_API_KEY = 'test-key';
        delete process.env.ANTHROPIC_BASE_URL;
        delete process.env.ANTHROPIC_MODEL;

        const result = loadProviders({});

        expect(result.anthropic).toBeDefined();
        expect(result.anthropic.authToken).toBe('test-key');
        expect(result.anthropic.baseURL).toBe('https://api.anthropic.com'); // 默认值
        expect(result.anthropic.models).toEqual(['claude-sonnet-4-20250514']); // 默认模型

        delete process.env.ANTHROPIC_API_KEY;
      });

      test('无任何配置时返回空对象', () => {
        mockExistsSync.mockReturnValue(false);
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.ANTHROPIC_BASE_URL;
        delete process.env.ANTHROPIC_MODEL;

        const result = loadProviders({});

        expect(result).toEqual({});
      });
    });

    describe('配置合并', () => {
      test('多个配置源合并', () => {
        // 准备: 直接配置提供 anthropic
        const directConfig: ProviderConfig = {
          baseURL: 'https://direct.example.com',
          authType: 'apiKey',
          authToken: 'direct-key',
          models: ['direct-model'],
        };

        // 准备: 项目配置提供 openai
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify({
          providers: {
            openai: {
              baseURL: 'https://project-openai.example.com',
              authType: 'apiKey',
              authToken: 'project-openai-key',
              models: ['project-openai-model'],
            }
          }
        }));

        // 执行
        const result = loadProviders({
          providers: {
            anthropic: directConfig
          }
        });

        // 验证: 合并了直接配置和项目配置
        expect(result.anthropic).toEqual(directConfig);
        expect(result.openai).toBeDefined();
        expect(result.openai.baseURL).toBe('https://project-openai.example.com');
      });
    });

    describe('边界情况', () => {
      test('空配置文件返回空对象', () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify({ providers: {} }));

        const result = loadProviders({});

        expect(result).toEqual({});
      });

      test('配置文件包含无效 provider 时跳过', () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify({
          providers: {
            invalid: {
              // 缺少必需字段
            },
            valid: {
              baseURL: 'https://valid.example.com',
              authType: 'apiKey',
              models: ['valid-model'],
            }
          }
        }));

        const result = loadProviders({});

        // 验证: 只加载了有效的 provider
        expect(result.valid).toBeDefined();
        expect(result.invalid).toBeUndefined();
      });
    });
  });
});
