import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getGlobalConfig,
  getProjectConfig,
  addProvider,
  deleteProvider,
  updateProvider,
  getJudgeConfig,
  setJudgeConfig,
  maskApiKey,
  JudgeConfig,
} from './config-writer';
import { ProviderConfig } from '../src/types/types';

// Mock fs and os
jest.mock('fs');
jest.mock('os');

const mockHomedir = '/mock/home';
const mockCwd = '/mock/project';

(os.homedir as jest.Mock).mockReturnValue(mockHomedir);
// We need to mock process.cwd since config-writer uses it
const originalCwd = process.cwd;
beforeAll(() => {
  (process as any).cwd = () => mockCwd;
});
afterAll(() => {
  (process as any).cwd = originalCwd;
});

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    authToken: 'sk-test-key-12345678',
    baseURL: 'https://api.example.com',
    authType: 'apiKey',
    models: ['test-model'],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('maskApiKey', () => {
  it('masks middle of long key', () => {
    expect(maskApiKey('sk-abcdefgh12345678')).toBe('sk-a****5678');
  });

  it('returns **** for short key', () => {
    expect(maskApiKey('abc')).toBe('****');
  });

  it('returns **** for 4-char key', () => {
    expect(maskApiKey('abcd')).toBe('****');
  });
});

describe('getGlobalConfig', () => {
  it('returns empty object when config file does not exist', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    expect(getGlobalConfig()).toEqual({});
  });

  it('returns parsed config when file exists', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ providers: { openai: { authToken: 'sk-test' } } })
    );
    const config = getGlobalConfig();
    expect(config.providers).toBeDefined();
    expect(config.providers!.openai).toEqual({ authToken: 'sk-test' });
  });

  it('reads from ~/.latte_models/config.json', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    getGlobalConfig();
    const expectedPath = path.join(mockHomedir, '.latte_models', 'config.json');
    expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
  });
});

describe('getProjectConfig', () => {
  it('reads from .latte/models_config.json in cwd', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    getProjectConfig();
    const expectedPath = path.join(mockCwd, '.latte', 'models_config.json');
    expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
  });
});

describe('addProvider', () => {
  it('adds provider to global scope', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('{}');
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});

    const provider = makeProvider();
    addProvider('global', 'my-provider', provider);

    expect(fs.writeFileSync as jest.Mock).toHaveBeenCalledTimes(1);
    const writtenContent = JSON.parse(
      (fs.writeFileSync as jest.Mock).mock.calls[0][1]
    );
    expect(writtenContent.providers['my-provider']).toEqual(provider);
  });

  it('adds provider to project scope', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('{}');
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});

    const provider = makeProvider();
    addProvider('project', 'my-provider', provider);

    const configPath = (fs.writeFileSync as jest.Mock).mock.calls[0][0];
    expect(configPath).toContain('.latte');
  });
});

describe('deleteProvider', () => {
  it('removes provider from config', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ providers: { 'my-provider': makeProvider() } })
    );
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});

    deleteProvider('global', 'my-provider');

    const writtenContent = JSON.parse(
      (fs.writeFileSync as jest.Mock).mock.calls[0][1]
    );
    expect(writtenContent.providers['my-provider']).toBeUndefined();
  });

  it('is no-op when no providers exist', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('{}');
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});

    // Should not throw
    expect(() => deleteProvider('global', 'nonexistent')).not.toThrow();
  });
});

describe('updateProvider', () => {
  it('replaces existing provider config', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ providers: { 'my-provider': makeProvider({ models: ['old'] }) } })
    );
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});

    updateProvider('global', 'my-provider', makeProvider({ models: ['new-model'] }));

    const writtenContent = JSON.parse(
      (fs.writeFileSync as jest.Mock).mock.calls[0][1]
    );
    expect(writtenContent.providers['my-provider'].models).toEqual(['new-model']);
  });
});

describe('getJudgeConfig', () => {
  it('returns null when no judge config', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ providers: {} })
    );
    expect(getJudgeConfig()).toBeNull();
  });

  it('returns judge config when present', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    const judge: JudgeConfig = {
      provider: 'openai',
      model: 'gpt-4',
      dimensions: ['准确性', '完整性'],
    };
    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ providers: {}, _judge: judge })
    );
    expect(getJudgeConfig()).toEqual(judge);
  });
});

describe('setJudgeConfig', () => {
  it('writes judge config to project config', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('{}');
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});

    const judge: JudgeConfig = {
      provider: 'openai',
      model: 'gpt-4',
      dimensions: ['准确性'],
    };
    setJudgeConfig(judge);

    const writtenContent = JSON.parse(
      (fs.writeFileSync as jest.Mock).mock.calls[0][1]
    );
    expect(writtenContent._judge).toEqual(judge);
  });
});
