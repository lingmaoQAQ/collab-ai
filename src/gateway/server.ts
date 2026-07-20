// Gateway Server — HTTP + WebSocket
// 中心节点：管理 Room 状态 + 路由消息 + Mediator 协调

import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { getDatabase } from "../sessions/database.js";
import { UserManager, RoomManager } from "../identity/manager.js";
import { MemoryStore } from "../memory/store.js";
import { EventStore } from "../events/store.js";
import type { NodeMessage, GatewayMessage, GatewayNode } from "./types.js";

const nodes = new Map<WebSocket, GatewayNode>();

export function startGateway(port = 3000): void {
  const db = getDatabase();
  const userMgr = new UserManager(db);
  const roomMgr = new RoomManager(db);
  const events = new EventStore(db);

  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    // GET /health
    if (req.url === "/health") {
      res.end(JSON.stringify({ status: "ok", nodes: nodes.size }));
      return;
    }

    // GET /rooms
    if (req.url === "/rooms" && req.method === "GET") {
      const rooms = roomMgr.list();
      res.end(JSON.stringify(rooms));
      return;
    }

    // POST /rooms { name }
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

  wss.on("connection", (ws, req: IncomingMessage) => {
    // 从 URL 参数读取身份
    const url = new URL(req.url || "/", "http://localhost");
    const roomId = url.searchParams.get("room") || "";
    const userName = url.searchParams.get("user") || "anonymous";
    const workspace = url.searchParams.get("workspace") || process.cwd();

    const user = userMgr.getOrCreate(userName);
    const room = roomMgr.get(roomId);

    if (!room) {
      send(ws, { type: "error", message: `Room "${roomId}" not found. Create one first with POST /rooms.` });
      ws.close();
      return;
    }

    // 自动加入房间
    roomMgr.addMember(roomId, user.id, "developer");
    events.record(roomId, user.id, "member_joined", { workspace });

    // 注册节点
    nodes.set(ws, {
      ws, user: userName, roomId, workspace,
      connectedAt: new Date().toISOString(),
    });

    // 发送欢迎消息
    const members = [...nodes.values()]
      .filter((n) => n.roomId === roomId)
      .map((n) => ({ name: n.user, workspace: n.workspace }));
    send(ws, { type: "welcome", room: { id: room.id, name: room.name }, members });

    // 广播加入通知
    broadcast(roomId, { type: "joined", user: userName, workspace }, ws);

    console.log(`[Gateway] ${userName} 已连接 (${room.name}, ${workspace}) | 在线: ${nodes.size}`);

    ws.on("message", async (raw) => {
      try {
        const msg: NodeMessage = JSON.parse(raw.toString());
        const node = nodes.get(ws);
        if (!node) return;

        switch (msg.type) {
          case "chat": {
            broadcast(node.roomId, {
              type: "broadcast",
              from: node.user,
              text: msg.text,
              timestamp: new Date().toISOString(),
            }, ws);
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
            send(ws, {
              type: "recall_result", query: msg.query,
              results: text || "未找到相关记忆",
            });
            break;
          }
        }
      } catch (err) {
        send(ws, { type: "error", message: String(err) });
      }
    });

    ws.on("close", () => {
      const node = nodes.get(ws);
      if (node) {
        broadcast(node.roomId, { type: "left", user: node.user });
        nodes.delete(ws);
        console.log(`[Gateway] ${node.user} 断开 | 在线: ${nodes.size}`);
      }
    });
  });

  server.listen(port, () => {
    console.log(`\n  CollabAI Gateway v0.7.0`);
    console.log(`  HTTP:  http://localhost:${port}`);
    console.log(`  WS:    ws://localhost:${port}/ws`);
    console.log(`  房间数: ${roomMgr.list().length}`);
    console.log(`  节点数: ${nodes.size}\n`);
  });
}

function send(ws: WebSocket, msg: GatewayMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(roomId: string, msg: GatewayMessage, exclude?: WebSocket): void {
  for (const [ws, node] of nodes) {
    if (node.roomId === roomId && ws !== exclude) {
      send(ws, msg);
    }
  }
}
