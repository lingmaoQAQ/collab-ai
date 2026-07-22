// Gateway Server v0.8 — AI 技术协作者模式
// 不仅是消息中转，更是项目 AI 大脑：接收消息 → 组装上下文 → LLM 回复

import { createServer, type IncomingMessage } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { getDatabase } from "../sessions/database.js";
import { UserManager, RoomManager } from "../identity/manager.js";
import { MemoryStore } from "../memory/store.js";
import { EventStore } from "../events/store.js";
import { SessionStore } from "../sessions/store.js";
import { ContextEngine } from "../context/engine.js";
import { Mediator } from "../mediator/engine.js";
import { showBanner } from "../ui/banner.js";
import { log } from "../utils/log.js";
import { closeDatabase } from "../sessions/database.js";
import { loadOrgGraph, findGroup, getGroupMembers, getParent } from "../org/index.js";
import { CollabError } from "../utils/errors.js";
import { createNotifiers, notifyAll, formatTaskNotification } from "../notify/index.js";
import type { Notifier } from "../notify/index.js";
import type { NodeMessage, GatewayMessage, GatewayNode } from "./types.js";

const nodes = new Map<WebSocket, GatewayNode>();
let _server: ReturnType<typeof createServer> | null = null;

// LLM 懒加载
let _runtime: any = null;
let _model: any = null;
let _modelName = "";
let _gatewayToken = "";

async function initAI(): Promise<void> {
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
  await import("../tools/index.js");
}

export async function startGateway(port = 3000, token = ""): Promise<void> {
  _gatewayToken = token;
  const db = getDatabase();
  const userMgr = new UserManager(db);
  const roomMgr = new RoomManager(db);
  const events = new EventStore(db);
  const engine = new ContextEngine(db);
  const mediator = new Mediator(db);
  const notifiers = createNotifiers();

  await initAI();

  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    // Dashboard HTML
    if (req.url === "/" || req.url === "/dashboard.html") {
      try {
        const htmlPath = resolve(dirname(fileURLToPath(import.meta.url)), "dashboard.html");
        const html = readFileSync(htmlPath, "utf-8");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(html);
      } catch {
        res.end(`<h1>CollabAI Dashboard</h1><p>Dashboard 文件未找到</p>`);
      }
      return;
    }

    // Dashboard API（支持 ?room=id 筛选）
    if (req.url?.startsWith("/dashboard")) {
      const url = new URL(req.url, "http://localhost");
      const filterRoom = url.searchParams.get("room") || "";

      const allMembers: Array<{ name: string; workspace: string; roomId: string; roomName: string }> = [];
      const allMemories: Array<{ key: string; value: string; category: string; roomId: string }> = [];
      const allEvents: Array<{ event_type: string; userName: string; created_at: string; roomId: string }> = [];
      const roomSet = new Set<string>();

      for (const [_, node] of nodes) {
        if (filterRoom && node.roomId !== filterRoom) continue;
        const r = roomMgr.get(node.roomId);
        allMembers.push({ name: node.user, workspace: node.workspace, roomId: node.roomId, roomName: r?.name || "" });
        roomSet.add(node.roomId);
        try {
          const mem = new MemoryStore(node.roomId, db);
          for (const m of mem.list()) {
            allMemories.push({ key: m.key, value: m.value, category: m.category, roomId: node.roomId });
          }
          for (const e of events.list(node.roomId, 10)) {
            allEvents.push({
              event_type: e.eventType,
              userName: e.userName || e.userId || "",
              created_at: e.createdAt || "",
              roomId: node.roomId,
            });
          }
        } catch { /* skip */ }
      }

      // 所有房间列表
      const allRooms = roomMgr.list().map((r: any) => ({ id: r.id, name: r.name, memberCount: 0 }));

      res.end(JSON.stringify({
        members: allMembers,
        memories: allMemories,
        events: allEvents,
        rooms: allRooms,
        auth: _gatewayToken ? "需要 token" : "开放",
        nodeCount: nodes.size,
        aiAvailable: !!_runtime,
      }));
      return;
    }

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
    const clientToken = url.searchParams.get("token") || "";

    // Token 认证
    if (_gatewayToken && clientToken !== _gatewayToken) {
      send(ws, { type: "error", message: "认证失败: token 不正确" });
      ws.close();
      console.log(`[Gateway] 拒绝未授权连接`);
      return;
    }

    const roomId = url.searchParams.get("room") || "";
    const userName = url.searchParams.get("user") || "anonymous";
    const workspace = url.searchParams.get("workspace") || process.cwd();

    const user = userMgr.getOrCreate(userName);
    // 支持短ID前缀匹配
    let room = roomMgr.get(roomId);
    if (!room && roomId.length >= 6) {
      room = (roomMgr.list() as any[]).find((r: any) => r.id?.startsWith(roomId)) || null;
    }

    if (!room) {
      send(ws, { type: "error", message: CollabError.notFound("room").message });
      ws.close();
      return;
    }

    const realRoomId = room.id;
    roomMgr.addMember(realRoomId, user.id, "developer");
    events.record(realRoomId, user.id, "member_joined", { workspace });
    nodes.set(ws, { ws, user: userName, roomId: realRoomId, workspace, connectedAt: new Date().toISOString() });

    const members = [...nodes.values()]
      .filter((n) => n.roomId === realRoomId)
      .map((n) => ({ name: n.user, workspace: n.workspace }));
    send(ws, { type: "welcome", room: { id: room.id, name: room.name }, members });

    // 回放离线消息
    try {
      const offlineMsgs = db.prepare(
        `SELECT id, message_json FROM offline_messages WHERE room_id = ? AND target_user = ? AND delivered = 0 ORDER BY id`,
      ).all(realRoomId, userName) as Array<{ id: number; message_json: string }>;
      if (offlineMsgs.length > 0) {
        for (const om of offlineMsgs) {
          try { send(ws, JSON.parse(om.message_json)); } catch { /* skip */ }
        }
        db.prepare(`UPDATE offline_messages SET delivered = 1 WHERE room_id = ? AND target_user = ?`)
          .run(realRoomId, userName);
        send(ws, { type: "activity", from: "系统", text: `回放 ${offlineMsgs.length} 条离线消息`, timestamp: new Date().toISOString() });
      }
    } catch { /* ignore */ }

    // 发送项目动态摘要
    try {
      const wn = mediator.whatsNew(realRoomId, user.id);
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
    } catch (err) { log.error("操作失败", err); }

    broadcast(realRoomId, { type: "joined", user: userName, workspace }, ws);
    console.log(`[Gateway] ${userName} → ${room.name} | 在线: ${nodes.size}`);

    ws.on("message", async (raw) => {
      try {
        const msg: NodeMessage = JSON.parse(raw.toString());
        const node = nodes.get(ws);
        if (!node) return;

        switch (msg.type) {
          case "chat": {
            // 1. 加载或创建用户会话
            const store = new SessionStore(db);
            let session = store.getLatestForUser(node.roomId, user.id);
            if (!session) {
              session = store.create(node.roomId, user.id, "Gateway 会话", _modelName,
                "你是 CollabAI 技术协作者。你可以使用 read_file/edit_file/write_file 等工具来读写用户工作区的文件。当用户要求修改代码时，请先读取文件，然后用 edit_file 精确修改。用中文回复。");
              events.record(node.roomId, user.id, "session_started", {});
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
              roomId: node.roomId, userId: user.id, sessionId: session.id,
              systemPrompt: "你是 AI 技术协作者，了解项目全局。用中文简洁回答。",
              messages, maxTokens: Math.floor((_model?.contextWindow || 128000) * 0.4),
            });

            // 5. Mediator 增强跨用户感知
            let crossUserText = "";
            try {
              const enhanced = await mediator.enhanceContext({
                roomId: node.roomId, userId: user.id,
                projectContext: assembled.systemPromptAddition || "",
              }, _runtime, _model);
              crossUserText = enhanced.addition;
            } catch (err) { log.error("操作失败", err); }

            // 6. 组装最终 system prompt
            const ctxParts = [assembled.systemPromptAddition, crossUserText].filter(Boolean);
            const finalSystem = ctxParts.length > 0
              ? ctxParts.join("\n\n") + "\n\n---\n\n你是 CollabAI 项目的 AI 技术协作者。用中文简洁回答。"
              : "你是 CollabAI 项目的 AI 技术协作者。用中文简洁回答。";

            // 7. LLM 调用（支持工具转发）
            let responseText = "";
            let toolCallsMade = 0;
            try {
              const { runToolLoop } = await import("../tools/loop.js");
              const result = await runToolLoop({
                runtime: _runtime,
                model: _model,
                system: finalSystem,
                messages: assembled.messages
                  .filter((m: any) => m.role !== "system")
                  .map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
                maxToolRounds: 3,
                maxTokens: 500,
                temperature: 0.7,
                onToolUse: (tc) => {
                  toolCallsMade++;
                  broadcast(node.roomId, {
                    type: "activity",
                    from: "系统",
                    text: `${node.user} 的 AI 正在执行: ${tc.name}`,
                    timestamp: new Date().toISOString(),
                  }, ws);
                },
                remoteExecute: async (tc) => {
                  // 转发工具调用到用户节点执行
                  return new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                      resolve({ callId: tc.id, content: "工具执行超时", isError: true });
                    }, 30000);

                    const handler = (raw: any) => {
                      try {
                        const msg = JSON.parse(raw.toString());
                        if (msg.type === "tool_result" && msg.callId === tc.id) {
                          clearTimeout(timeout);
                          ws.removeListener("message", handler);
                          resolve({ callId: tc.id, content: msg.result, isError: msg.isError });
                        }
                      } catch (err) { log.error("操作失败", err); }
                    };
                    ws.on("message", handler);
                    send(ws, {
                      type: "tool_call",
                      callId: tc.id,
                      tool: tc.name,
                      args: tc.arguments,
                    });
                  });
                },
              });
              responseText = result.finalText || "(无回复)";
              if (toolCallsMade > 0) {
                responseText += `\n(已执行 ${toolCallsMade} 个工具)`;
              }
            } catch (err: any) {
              responseText = `[AI 错误: ${err.message}]`;
            }

            // 8. 保存AI回复
            store.addMessage({ sessionId: session.id, role: "assistant", content: responseText });
            events.record(node.roomId, user.id, "message_sent", { sessionId: session.id });

            // 8.5 自动变更检测：AI 改了文件 → 查 Org Graph → 建议通知
            let changeSuggestion = "";
            try {
              const changedPattern = /(已写入|已编辑)[:\s]*([^\s,]+\.(?:py|ts|js|java|go|rs|yml|yaml|json|md))/g;
              let match;
              const changedFiles: string[] = [];
              while ((match = changedPattern.exec(responseText)) !== null) {
                changedFiles.push(match[2]);
              }
              if (changedFiles.length > 0) {
                const graph = loadOrgGraph();
                if (graph) {
                  const affected = new Map<string, string>();
                  for (const file of changedFiles) {
                    const ext = file.split(".").pop() || "";
                    const skillMap: Record<string, string> = { py: "python", ts: "typescript", js: "javascript", go: "go", rs: "rust" };
                    const skill = skillMap[ext] || ext;
                    for (const n of (await import("../org/types.js")).findBySkill(graph, skill)) {
                      if (n.id !== user.id && !affected.has(n.name)) {
                        affected.set(n.name, file);
                      }
                    }
                  }
                  if (affected.size > 0) {
                    const names = [...affected.keys()].join(", ");
                    changeSuggestion = `\n\n💡 检测到文件变更，可能影响: ${names}。使用 /task send <用户> <内容> 通知他们。`;
                  }
                }
              }
            } catch { /* 检测失败不阻塞 */ }

            // 9. 回复提问者（含变更建议）
            if (changeSuggestion && !responseText.includes("💡 检测到")) {
              responseText += changeSuggestion;
            }
            send(ws, {
              type: "ai_response",
              text: responseText,
              timestamp: new Date().toISOString(),
            });

            // 10. 学习风格
            mediator.analyzeTurn(
              { roomId: node.roomId, userId: user.id, userMessage: msg.text, aiResponse: responseText },
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

          // ── 结构化任务消息（子组感知 + AI 分析） ──
          case "task": {
            // AI 分析任务内容，生成建议
            let aiAdvice = "";
            if (_runtime) {
              try {
                const mem = new MemoryStore(node.roomId, db);
                const relatedMemories = mem.search(
                  (msg.payload as any).file || (msg.payload as any).topic || msg.taskType, 3,
                );
                const memContext = relatedMemories.map((m) => `[${m.category}] ${m.key}: ${m.value}`).join("\n");

                const stream = _runtime.streamSimple({
                  model: _model,
                  messages: [{
                    role: "user",
                    content: `分析以下任务并生成 1-2 句中文建议（不超过100字）：
任务类型: ${msg.taskType}
发送者: ${node.user}
内容: ${JSON.stringify(msg.payload).slice(0, 300)}
相关项目记忆: ${memContext || "无"}
建议聚焦：受影响的人需要注意什么？`,
                  }],
                  maxTokens: 150,
                  temperature: 0.3,
                });
                for await (const e of stream) {
                  if (e.type === "text_delta") aiAdvice += e.text;
                }
              } catch { /* AI分析失败不影响投递 */ }
            }

            const taskMsg = {
              type: "task_notify" as const,
              taskType: msg.taskType,
              from: node.user,
              payload: { ...msg.payload, aiAdvice: aiAdvice.trim() || undefined },
              priority: msg.priority || "normal",
              messageId: "task_" + Date.now(),
              timestamp: new Date().toISOString(),
            };

            // 加载 Org Graph 做子组感知路由
            const graph = loadOrgGraph();
            const senderGroup = graph ? findGroup(graph, node.user) : null;
            const targetGroup = msg.to !== "broadcast" && graph ? findGroup(graph, msg.to) : null;
            const sameGroup = senderGroup && targetGroup && senderGroup.id === targetGroup.id;

            // 通知已配置的外部通道
            if (notifiers.length > 0) {
              const notifMsg = formatTaskNotification(
                msg.taskType, node.user, msg.to, msg.payload,
              );
              notifyAll(notifiers, notifMsg);
            }

            if (msg.to === "broadcast") {
              broadcast(node.roomId, taskMsg);
              events.record(node.roomId, user.id, "task_sent", { taskType: msg.taskType, to: "broadcast" });
            } else {
              let delivered = false;
              for (const [targetWs, targetNode] of nodes) {
                if (targetNode.roomId === node.roomId && targetNode.user === msg.to) {
                  send(targetWs, taskMsg);
                  delivered = true;
                  break;
                }
              }
              if (delivered) {
                const groupInfo = sameGroup
                  ? ` (组内: ${senderGroup!.name})`
                  : targetGroup
                  ? ` (跨组: ${senderGroup?.name || "?"} → ${targetGroup.name})`
                  : "";
                send(ws, { type: "activity", from: "系统", text: `任务已送达 ${msg.to}${groupInfo}`, timestamp: new Date().toISOString() });
                events.record(node.roomId, user.id, "task_sent", { taskType: msg.taskType, to: msg.to, sameGroup });
              } else {
                // 存入离线队列
                db.prepare(`INSERT INTO offline_messages (room_id, target_user, message_json) VALUES (?, ?, ?)`)
                  .run(node.roomId, msg.to, JSON.stringify(taskMsg));
                send(ws, { type: "activity", from: "系统", text: `${msg.to} 当前离线，消息已保存`, timestamp: new Date().toISOString() });
              }
            }
            break;
          }
          case "task_reply": {
            // 转发回复
            for (const [targetWs, targetNode] of nodes) {
              if (targetNode.roomId === node.roomId && targetNode.user === msg.replyTo) {
                send(targetWs, {
                  type: "task_reply",
                  replyTo: msg.replyTo,
                  from: node.user,
                  text: msg.text,
                  accepted: msg.accepted,
                });
                break;
              }
            }
            break;
          }
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        log.error("消息处理失败", err);
        send(ws, { type: "error", message: msg.slice(0, 100) || "消息处理失败" });
      }
    });

    ws.on("close", () => {
      const node = nodes.get(ws);
      if (node) { broadcast(node.roomId, { type: "left", user: node.user }); nodes.delete(ws); }
    });
  });

  _server = server;
  server.listen(port, () => {
    console.log("");
    showBanner("1.1.0", _model?.name || "AI", _model?.provider?.name || "", "Gateway", `:${port}`);
    const authStatus = _gatewayToken ? "需要 token" : "开放（无 token）";
    console.log(`  HTTP: http://localhost:${port}  |  WS: ws://localhost:${port}/ws`);
    const notifyStatus = notifiers.length > 0 ? `已启用 (${notifiers.map((n) => n.name).join(",")})` : "未配置";
    console.log(`  认证: ${authStatus}`);
    console.log(`  通知: ${notifyStatus}`);
    console.log(`  房间: ${roomMgr.list().length}  |  在线: ${nodes.size}\n`);
  });

  // 优雅退出
  const shutdown = () => {
    console.log("\n  Gateway 正在关闭...");
    for (const [ws, node] of nodes) {
      send(ws, { type: "error", message: "Gateway 正在关闭" });
      ws.close();
    }
    nodes.clear();
    wss.close();
    server.close();
    closeDatabase();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function send(ws: WebSocket, msg: GatewayMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(roomId: string, msg: GatewayMessage, exclude?: WebSocket): void {
  for (const [ws, node] of nodes) {
    if (node.roomId === roomId && ws !== exclude) send(ws, msg);
  }
}
