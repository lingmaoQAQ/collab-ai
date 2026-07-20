// 示例插件：Hello World
// 任何导出 register() 或 tools[] 的 .ts 文件都会被自动加载

import type { PluginModule } from "../src/plugins/loader.js";

const plugin: PluginModule = {
  name: "hello-world",
  description: "示例插件，演示插件系统",

  tools: [{
    def: {
      name: "hello",
      description: "返回问候语",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "要问候的名字" },
        },
        required: ["name"],
      },
    },
    handler: async (args) => ({
      callId: "",
      content: `Hello, ${args.name}! 这是来自 CollabAI 插件的问候。`,
    }),
  }],
};

export default plugin;
