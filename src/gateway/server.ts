// Gateway Server v0.8 — AI 技术协作者模式
// 不仅是消息中转，更是项目 AI 大脑：接收消息 → 组装上下文 → LLM 回复

import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { getDatabase } from "../sessions/database.js";
import { UserManager, RoomManager } from "../identity/manager.js";
import { MemoryStore } from "../memory/store.js";
import { EventStore } from "../events/store.js";
import { SessionStore } from "../sessions/store.js";
import { ContextEngine } from "../context/engine.js";
import { Mediator } from "../mediator/engine.js";
import { showBanner } from "../ui/banner.js";
import type { NodeMessage, GatewayMessage, GatewayNode } from "./types.js";

const nodes = new Map<WebSocket, GatewayNode>();

// LLM 懒加载
let _runtime: any = null;
let _model: any = null;
let _modelName = "";

async function initAI() {
  if (_runtime) return;
  const { getDefaultRegistry, createLlmRuntime } = await import("../llm/index.js");
  const registry = getDefaultRegistry();

  if (process.env.ANTHROPIC_API_KEY) {
    const { createAnthropicProvider } = await import("../llm/providers/anthropic.js");
    registry.register(createAnthropicProvider());
  }
  if (process.env.OPENAI_API_KEY) {
    const { createOpenAIProvider } = await import("../llm/providers/openai.js");
    registry.register(createOpenAIProvider());
  }
  const chatKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (chatKey) {
    const { createOpenAIChatProvider } = await import("../llm/providers/openai-completions.js");
    registry.register(createOpenAIChatProvider({
      apiKey: chatKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.deepseek.com/v1",
      api: "openai-chat",
    }));
  }

  const { BUILTIN_MODELS } = await import("../llm/index.js");
  _modelName = process.env.COLLABAI_MODEL || "deepseek-chat";
  _model = BUILTIN_MODELS.find((m: any) => m.id === _modelName);
  if (!_model) _model = BUILTIN_MODELS[0];
  _runtime = createLlmRuntime(registry);

  // 注册工具
  await import("../tools/index.js");
}

export async function startGateway(port = 3000): Promise<void> {
  const db = getDatabase();
  const userMgr = new UserManager(db);
  const roomMgr = new RoomManager(db);
  const events = new EventStore(db);
  const engine = new ContextEngine(db);
  const mediator = new Mediator(db);

  await initAI();

  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    if (req.url === "/health") {
      res.end(JSON.stringify({ status: "ok", nodes: nodes.size, ai: !!_runtime }));
      return;
    }

    if (req.url === "/rooms" && req.method === "GET") {
      res.end(JSON.stringify(roomMgr.list()));
      return;
    }

    if (req.url === "/rooms" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const { name, userId } = JSON.parse(body);
          const user = userMgr.getOrCreate(userId || "admin", "");
          const room = roomMgr.create(name, "", user.id);
          events.record(room.id, user.id, "room_created", { name });
          res.end(JSON.stringify(room));
        } catch (err: any) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "/", "http://localhost");
    const roomId = url.searchParams.get("room") || "";
    const userName = url.searchParams.get("user") || "anonymous";
    const workspace = url.searchParams.get("workspace") || process.cwd();

    const user = userMgr.getOrCreate(userName);
    const room = roomMgr.get(roomId);

    if (!room) {
      send(ws, { type: "error", message: `Room "${roomId}" not found. Create via POST /rooms first.` });
      ws.close();
      return;
    }

    roomMgr.addMember(roomId, user.id, "developer");
    events.record(roomId, user.id, "member_joined", { workspace });
    nodes.set(ws, { ws, user: userName, roomId, workspace, connectedAt: new Date().toISOString() });

    const members = [...nodes.values()]
      .filter((n) => n.roomId === roomId)
      .map((n) => ({ name: n.user, workspace: n.workspace }));
    send(ws, { type: "welcome", room: { id: room.id, name: room.name }, members });

    // 发送项目动态摘要
    try {
      const wn = mediator.whatsNew(roomId, user.id);
      if (wn.activeUsers.length || wn.newMemories.length) {
        const parts: string[] = [];
        for (const u of wn.activeUsers) parts.push(`${u.userName} 在处理 [${u.currentTopic}]`);
        for (const k of wn.newMemories) parts.push(`新知识: ${k}`);
        if (parts.length) {
          send(ws, {
            type: "broadcast",
            from: "系统",
            text: `项目动态:\n${parts.join("\n")}`,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch { /* ignore */ }

    broadcast(roomId, { type: "joined", user: userName, workspace }, ws);
    console.log(`[Gateway] ${userName} → ${room.name} | 在线: ${nodes.size}`);

    ws.on("message", async (raw) => {
      try {
        const msg: NodeMessage = JSON.parse(raw.toString());
        const node = nodes.get(ws);
        if (!node) return;

        switch (msg.type) {
          case "chat": {
            // 1. 广播"某人在问AI"给其他人
            broadcast(node.roomId, {
              type: "activity",
              from: "系统",
              text: `${node.user} 正在向 AI 提问...`,
              timestamp: new Date().toISOString(),
            }, ws);

            // 2. 加载或创建用户会话
            const store = new SessionStore(db);
            let session = store.getLatestForUser(roomId, user.id);
            if (!session) {
              session = store.create(roomId, user.id, "Gateway 会话", _modelName,
                "你是 CollabAI 项目的 AI 技术协作者。你有项目全局视角，知道团队成员在做什么。用中文简洁回答。");
              events.record(roomId, user.id, "session_started", {});
            }
            store.addMessage({ sessionId: session.id, role: "user", content: msg.text });

            // 3. 构建消息列表
            const dbMsgs = store.getRecentMessages(session.id, 30);
            const messages = dbMsgs.map((m) => ({
              role: m.role as "system" | "user" | "assistant",
              content: m.content,
            }));
            if (!messages.some((m) => m.role === "system")) {
              messages.unshift({
                role: "system",
                content: "你是 CollabAI 项目的 AI 技术协作者。你有项目全局视角，用中文简洁回答。",
              });
            }

            // 4. ContextEngine 组装项目上下文
            const assembled = engine.assemble({
              roomId, userId: user.id, sessionId: session.id,
              systemPrompt: "你是 AI 技术协作者，了解项目全局。用中文简洁回答。",
              messages, maxTokens: Math.floor((_model?.contextWindow || 128000) * 0.4),
            });

            // 5. Mediator 增强跨用户感知
            let crossUserText = "";
            try {
              const enhanced = await mediator.enhanceContext({
                roomId, userId: user.id,
                projectContext: assembled.systemPromptAddition || "",
              }, _runtime, _model);
              crossUserText = enhanced.addition;
            } catch { /* ignore */ }

            // 6. 组装最终 system prompt
            const ctxParts = [assembled.systemPromptAddition, crossUserText].filter(Boolean);
            const finalSystem = ctxParts.length > 0
              ? ctxParts.join("\n\n") + "\n\n---\n\n你是 CollabAI 项目的 AI 技术协作者。用中文简洁回答。"
              : "你是 CollabAI 项目的 AI 技术协作者。用中文简洁回答。";

            // 7. LLM 调用
            let responseText = "";
            try {
              const stream = _runtime.stream({
                model: _model,
                system: finalSystem,
                messages: assembled.messages,
                maxTokens: 500, temperature: 0.7,
              });
              for await (const event of stream) {
                if (event.type === "text_delta") responseText += event.text;
              }
            } catch (err: any) {
              responseText = `[AI 错误: ${err.message}]`;
            }

            // 8. 保存AI回复
            store.addMessage({ sessionId: session.id, role: "assistant", content: responseText });
            events.record(roomId, user.id, "message_sent", { sessionId: session.id });

            // 9. 回复提问者
            send(ws, {
              type: "ai_response",
              text: responseText,
              timestamp: new Date().toISOString(),
            });

            // 10. 通知其他人 AI 回复了什么（摘要）
            const preview = responseText.slice(0, 80) + (responseText.length > 80 ? "..." : "");
            broadcast(node.roomId, {
              type: "activity",
              from: "系统",
              text: `AI 回复了 ${node.user}: ${preview}`,
              timestamp: new Date().toISOString(),
            }, ws);

            // 11. 学习风格
            mediator.analyzeTurn(
              { roomId, userId: user.id, userMessage: msg.text, aiResponse: responseText },
              _runtime, _model,
            ).catch(() => {});
            break;
          }

          case "remember": {
            const mem = new MemoryStore(node.roomId, db);
            mem.set({
              key: msg.key, value: msg.value,
              category: (msg.category as any) || "knowledge",
              authorId: user.id,
            });
            events.record(node.roomId, user.id, "memory_added", { key: msg.key });
            broadcast(node.roomId, {
              type: "memory_update", key: msg.key, value: msg.value,
            });
            break;
          }
          case "recall": {
            const mem = new MemoryStore(node.roomId, db);
            const results = mem.search(msg.query, 5);
            const text = results.map((r) => `[${r.category}] ${r.key}: ${r.value}`).join("\n");
            send(ws, { type: "recall_result", query: msg.query, results: text || "未找到" });
            break;
          }
        }
      } catch (err) {
        send(ws, { type: "error", message: "消息处理失败" });
      }
    });

    ws.on("close", () => {
      const node = nodes.get(ws);
      if (node) { broadcast(node.roomId, { type: "left", user: node.user }); nodes.delete(ws); }
    });
  });

  server.listen(port, () => {
    console.log("");
    showBanner("0.8.0", _model?.name || "AI", _model?.provider?.name || "", "Gateway", `:${port}`);
    console.log(`  HTTP: http://localhost:${port}  |  WS: ws://localhost:${port}/ws`);
    console.log(`  房间: ${roomMgr.list().length}  |  在线: ${nodes.size}\n`);
  });
}

function send(ws: WebSocket, msg: GatewayMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(roomId: string, msg: GatewayMessage, exclude?: WebSocket): void {
  for (const [ws, node] of nodes) {
    if (node.roomId === roomId && ws !== exclude) send(ws, msg);
  }
}
