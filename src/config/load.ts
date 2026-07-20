// 配置加载 — 环境变量 + JSON 配置文件

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CollabAIConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

// 配置文件搜索路径（优先级从高到低）
function configSearchPaths(): string[] {
  const paths: string[] = [];

  // 1. 环境变量指定
  if (process.env.COLLABAI_CONFIG_PATH) {
    paths.push(process.env.COLLABAI_CONFIG_PATH);
  }

  // 2. 当前工作目录
  paths.push(resolve(process.cwd(), "collab-ai.json"));

  // 3. 用户主目录
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home) {
    paths.push(resolve(home, ".collab-ai", "config.json"));
  }

  return paths;
}

/** 从 JSON 文件加载配置 */
function loadJsonConfig(path: string): CollabAIConfig | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as CollabAIConfig;
  } catch {
    return null;
  }
}

/** 从环境变量读取配置 */
function loadEnvConfig(): CollabAIConfig {
  const config: CollabAIConfig = {};

  if (process.env.COLLABAI_MODEL) config.model = process.env.COLLABAI_MODEL;
  if (process.env.COLLABAI_PROVIDER) {
    config.provider = process.env.COLLABAI_PROVIDER;
  }
  if (process.env.COLLABAI_SYSTEM_PROMPT) {
    config.systemPrompt = process.env.COLLABAI_SYSTEM_PROMPT;
  }
  if (process.env.COLLABAI_MAX_TOKENS) {
    config.maxTokens = parseInt(process.env.COLLABAI_MAX_TOKENS, 10);
  }
  if (process.env.COLLABAI_TEMPERATURE) {
    config.temperature = parseFloat(process.env.COLLABAI_TEMPERATURE);
  }

  return config;
}

/** 加载并合并所有配置源 */
export function loadConfig(): Required<CollabAIConfig> {
  const envConfig = loadEnvConfig();
  let fileConfig: CollabAIConfig = {};

  for (const path of configSearchPaths()) {
    const loaded = loadJsonConfig(path);
    if (loaded) {
      fileConfig = loaded;
      break;
    }
  }

  // 合并优先级：文件配置 > 环境变量 > 默认值
  return {
    ...DEFAULT_CONFIG,
    ...envConfig,
    ...fileConfig,
  };
}

/** 获取 API Key */
export function getApiKey(provider: string): string | undefined {
  const keyMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
  };

  const envVar = keyMap[provider];
  if (envVar) {
    return process.env[envVar];
  }
  return undefined;
}
