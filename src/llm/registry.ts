// LLM Provider 注册表 — 参考 OpenClaw api-registry.ts 的延迟加载模式

import type { StreamFunction, CompleteFunction } from "./types.js";

export interface ApiProvider {
  /** Provider 标识，如 "anthropic-messages" */
  api: string;
  stream: StreamFunction;
  streamSimple: StreamFunction; // 无 tool 版本
  complete: CompleteFunction;
}

// ---- 注册表 ----
export interface ApiRegistry {
  register(provider: ApiProvider): void;
  get(api: string): ApiProvider | undefined;
  list(): ApiProvider[];
  unregister(api: string): void;
}

export function createApiRegistry(): ApiRegistry {
  const providers = new Map<string, ApiProvider>();

  return {
    register(provider) {
      if (providers.has(provider.api)) {
        throw new Error(`Provider "${provider.api}" already registered`);
      }
      providers.set(provider.api, provider);
    },

    get(api) {
      return providers.get(api);
    },

    list() {
      return [...providers.values()];
    },

    unregister(api) {
      providers.delete(api);
    },
  };
}

/** 全局默认注册表 */
let _defaultRegistry: ApiRegistry | null = null;

export function getDefaultRegistry(): ApiRegistry {
  if (!_defaultRegistry) {
    _defaultRegistry = createApiRegistry();
  }
  return _defaultRegistry;
}

export function setDefaultRegistry(registry: ApiRegistry): void {
  _defaultRegistry = registry;
}
