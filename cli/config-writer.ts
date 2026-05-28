import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProviderConfig } from '../src/types/types';

interface ConfigFile {
  providers?: Record<string, ProviderConfig>;
  _judge?: JudgeConfig;
}

export interface JudgeConfig {
  provider: string;
  model: string;
  dimensions: string[];
}

function getGlobalConfigPath(): string {
  return path.join(os.homedir(), '.latte_models', 'config.json');
}

function getProjectConfigPath(): string {
  return path.join(process.cwd(), '.latte', 'models_config.json');
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readConfig(configPath: string): ConfigFile {
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeConfig(configPath: string, config: ConfigFile): void {
  ensureDir(configPath);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function getGlobalConfig(): ConfigFile {
  return readConfig(getGlobalConfigPath());
}

export function getProjectConfig(): ConfigFile {
  return readConfig(getProjectConfigPath());
}

export function addProvider(scope: 'global' | 'project', name: string, provider: ProviderConfig): void {
  const configPath = scope === 'global' ? getGlobalConfigPath() : getProjectConfigPath();
  const config = readConfig(configPath);
  if (!config.providers) config.providers = {};
  config.providers[name] = provider;
  writeConfig(configPath, config);
}

export function deleteProvider(scope: 'global' | 'project', name: string): void {
  const configPath = scope === 'global' ? getGlobalConfigPath() : getProjectConfigPath();
  const config = readConfig(configPath);
  if (config.providers) {
    delete config.providers[name];
  }
  writeConfig(configPath, config);
}

export function updateProvider(scope: 'global' | 'project', name: string, provider: ProviderConfig): void {
  addProvider(scope, name, provider);
}

export function getJudgeConfig(): JudgeConfig | null {
  const projectConfig = getProjectConfig();
  return projectConfig._judge || null;
}

export function setJudgeConfig(judge: JudgeConfig): void {
  const configPath = getProjectConfigPath();
  const config = readConfig(configPath);
  config._judge = judge;
  writeConfig(configPath, config);
}

export function maskApiKey(key: string): string {
  if (key.length <= 4) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}
