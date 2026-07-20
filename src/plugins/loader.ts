// 插件自动加载器 — 扫描目录，动态加载工具插件

import { readdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { registerTool } from "../tools/registry.js";
import type { ToolDef, ToolHandler } from "../tools/types.js";

export interface PluginModule {
  name: string;
  description: string;
  tools?: Array<{ def: ToolDef; handler: ToolHandler }>;
  register?: () => void;
}

const loadedPlugins: PluginModule[] = [];

/** 加载指定目录中的所有插件 */
export async function loadPlugins(pluginsDir: string): Promise<PluginModule[]> {
  const absDir = resolve(pluginsDir);
  if (!existsSync(absDir)) {
    return [];
  }

  const entries = readdirSync(absDir);
  const results: PluginModule[] = [];

  for (const entry of entries) {
    // 跳过非 JS/TS 文件和非插件文件
    if (entry.startsWith(".") || entry.startsWith("_")) continue;
    if (entry.endsWith(".d.ts")) continue;

    const fullPath = resolve(absDir, entry);
    try {
      const stat = statSync(fullPath);
      if (!stat.isFile()) continue;

      // 只加载 .ts 和 .js 文件
      if (!entry.endsWith(".ts") && !entry.endsWith(".js") && !entry.endsWith(".mjs")) {
        continue;
      }

      const plugin = await loadPluginFile(fullPath);
      if (plugin) {
        results.push(plugin);
        loadedPlugins.push(plugin);

        // 注册工具
        if (plugin.tools) {
          for (const t of plugin.tools) {
            registerTool(t.def, t.handler);
          }
        }
        if (plugin.register) {
          plugin.register();
        }
        console.log(`  [plugin] ${plugin.name}: ${plugin.description}`);
      }
    } catch (err) {
      // 加载失败，跳过
    }
  }

  return results;
}

async function loadPluginFile(filePath: string): Promise<PluginModule | null> {
  try {
    const mod = await import(`file://${filePath}?t=${Date.now()}`);
    return (mod.default || mod) as PluginModule;
  } catch {
    return null;
  }
}

export function getLoadedPlugins(): PluginModule[] {
  return [...loadedPlugins];
}
