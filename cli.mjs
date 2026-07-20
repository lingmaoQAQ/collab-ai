#!/usr/bin/env node
// CollabAI CLI 入口 — 参考 OpenClaw openclaw.mjs 的最小化版本

import "dotenv/config";
import { runCli } from "./dist/cli/index.js";

runCli().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
