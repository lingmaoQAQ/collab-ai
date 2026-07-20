// LLM Runtime — 参考 OpenClaw stream.ts 的分发模式

import type { ApiProvider, ApiRegistry } from "./registry.js";
import type {
  Model,
  Message,
  Tool,
  StreamEvent,
  StreamOptions,
  CompleteOptions,
  CompleteFunction,
} from "./types.js";

export interface LlmRuntime {
  stream(opts: StreamOptions): AsyncIterable<StreamEvent>;
  complete(opts: CompleteOptions): ReturnType<CompleteFunction>;
  /** 不传 tools 的简化版 stream */
  streamSimple(opts: Omit<StreamOptions, "tools">): AsyncIterable<StreamEvent>;
}

export function createLlmRuntime(registry: ApiRegistry): LlmRuntime {
  function resolve(model: Model): ApiProvider {
    const provider = registry.get(model.api);
    if (!provider) {
      const available = registry.list().map((p) => p.api).join(", ");
      throw new Error(
        `No provider registered for "${model.api}". Available: [${available}]`,
      );
    }
    return provider;
  }

  return {
    async *stream(opts: StreamOptions): AsyncIterable<StreamEvent> {
      const provider = resolve(opts.model);
      yield* provider.stream(opts);
    },

    async *streamSimple(
      opts: Omit<StreamOptions, "tools">,
    ): AsyncIterable<StreamEvent> {
      const provider = resolve(opts.model);
      yield* provider.streamSimple({ ...opts, tools: undefined });
    },

    async complete(opts: CompleteOptions) {
      const provider = resolve(opts.model);
      return provider.complete(opts);
    },
  };
}
