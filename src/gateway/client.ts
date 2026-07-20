// Gateway Client — Node 端 WebSocket 客户端
// 连接 Gateway，收发消息，同步状态，执行远程工具

import WebSocket from "ws";
import "../tools/index.js"; // 注册内置工具
import { executeTool } from "../tools/registry.js";
import type { NodeMessage, GatewayMessage } from "./types.js";

export type MessageHandler = (msg: GatewayMessage) => void;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, MessageHandler[]>();
  private url = "";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;

  get connected(): boolean { return this._connected; }

  connect(url: string, roomId: string, user: string, workspace: string, token = ""): Promise<void> {
    const params = `room=${encodeURIComponent(roomId)}&user=${encodeURIComponent(user)}&workspace=${encodeURIComponent(workspace)}`;
    this.url = `${url}/ws?${params}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        this._connected = true;
        resolve();
      });

      this.ws.on("message", async (raw) => {
        try {
          const msg: GatewayMessage = JSON.parse(raw.toString());

          // 远程工具执行：Gateway 请求本地执行
          if (msg.type === "tool_call") {
            const result = await executeTool({
              id: msg.callId,
              name: msg.tool,
              arguments: msg.args,
            });
            this.ws!.send(JSON.stringify({
              type: "tool_result",
              callId: msg.callId,
              result: result.content,
              isError: result.isError,
            }));
            return;
          }

          this.emit(msg.type, msg);
          this.emit("*", msg);
        } catch { /* 忽略解析失败 */ }
      });

      this.ws.on("close", () => {
        this._connected = false;
        this.ws = null;
        this.emit("disconnected", { type: "error", message: "Connection closed" });
      });

      this.ws.on("error", (err) => {
        if (!this._connected) reject(err);
        this.emit("error", { type: "error", message: err.message });
      });

      setTimeout(() => { if (!this._connected) reject(new Error("Connection timeout")); }, 5000);
    });
  }

  /** 注册消息处理器 */
  on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  private emit(type: string, msg: GatewayMessage): void {
    const hs = this.handlers.get(type) || [];
    for (const h of hs) h(msg);
  }

  /** 发送消息到 Gateway */
  send(msg: NodeMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** 发送聊天消息 */
  chat(text: string): void {
    this.send({ type: "chat", text });
  }

  /** 记录共享记忆 */
  remember(key: string, value: string, category?: string): void {
    this.send({ type: "remember", key, value, category });
  }

  /** 搜索记忆 */
  recall(query: string): void {
    this.send({ type: "recall", query });
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this._connected = false;
  }
}
