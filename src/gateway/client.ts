// Gateway Client — 断线重连 + 离线缓冲

import WebSocket from "ws";
import "../tools/index.js";
import { executeTool } from "../tools/registry.js";
import type { NodeMessage, GatewayMessage } from "./types.js";

export type MessageHandler = (msg: GatewayMessage) => void;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, MessageHandler[]>();
  private url = "";
  private _connected = false;
  private _connecting = false;

  // 重连
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private shouldReconnect = false;

  // 离线缓冲
  private offlineBuffer: NodeMessage[] = [];
  private connectParams: { url: string; roomId: string; user: string; workspace: string; token: string } | null = null;

  get connected(): boolean { return this._connected; }
  get bufferedCount(): number { return this.offlineBuffer.length; }

  connect(url: string, roomId: string, user: string, workspace: string, token = ""): Promise<void> {
    this.connectParams = { url, roomId, user, workspace, token };
    this.shouldReconnect = true;
    const params = `room=${encodeURIComponent(roomId)}&user=${encodeURIComponent(user)}&workspace=${encodeURIComponent(workspace)}`;
    this.url = `${url}/ws?${params}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    if (this._connecting) return Promise.resolve();
    this._connecting = true;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        this._connected = true;
        this._connecting = false;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.emit("connected", { type: "welcome", room: { id: "", name: "" }, members: [] });

        // 回放离线消息
        if (this.offlineBuffer.length > 0) {
          const count = this.offlineBuffer.length;
          for (const msg of this.offlineBuffer) {
            if (this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify(msg));
            }
          }
          this.offlineBuffer = [];
          this.emit("activity", { type: "activity", from: "系统", text: `已重连，回放 ${count} 条离线消息`, timestamp: new Date().toISOString() });
        }
        resolve();
      });

      this.ws.on("message", async (raw) => {
        try {
          const msg: GatewayMessage = JSON.parse(raw.toString());
          if (msg.type === "tool_call") {
            const result = await executeTool({
              id: msg.callId, name: msg.tool, arguments: msg.args,
            });
            this.ws?.send(JSON.stringify({
              type: "tool_result", callId: msg.callId, result: result.content, isError: result.isError,
            }));
            return;
          }
          this.emit(msg.type, msg);
          this.emit("*", msg);
        } catch { /* 忽略解析失败 */ }
      });

      this.ws.on("close", () => {
        this._connected = false;
        this._connecting = false;
        this.ws = null;
        this.emit("disconnected", { type: "error", message: "连接已断开" });

        // 自动重连
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts), 30000);
          this.reconnectAttempts++;
          this.emit("activity", {
            type: "activity", from: "系统",
            text: `正在重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
            timestamp: new Date().toISOString(),
          });
          this.reconnectTimer = setTimeout(() => {
            if (this.connectParams) {
              const p = this.connectParams;
              this.connect(p.url, p.roomId, p.user, p.workspace, p.token);
            }
          }, delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          this.emit("error", { type: "error", message: "重连失败，已达最大重试次数" });
        }
      });

      this.ws.on("error", (err) => {
        if (!this._connected) reject(err);
        this.emit("error", { type: "error", message: err.message });
      });

      setTimeout(() => { if (!this._connected) { this._connecting = false; reject(new Error("连接超时")); } }, 5000);
    });
  }

  on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  private emit(type: string, msg: GatewayMessage): void {
    const hs = this.handlers.get(type) || [];
    for (const h of hs) h(msg);
  }

  send(msg: NodeMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.offlineBuffer.push(msg);
      if (this.offlineBuffer.length > 100) this.offlineBuffer.shift(); // 最多100条
    }
  }

  chat(text: string): void { this.send({ type: "chat", text }); }
  remember(key: string, value: string, category?: string): void { this.send({ type: "remember", key, value, category }); }
  recall(query: string): void { this.send({ type: "recall", query }); }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this._connected = false;
    this.offlineBuffer = [];
  }
}
