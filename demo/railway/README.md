# 铁路网络分析系统

数据结构课程设计项目 —— 前后端半分离架构

## 项目结构

| 文件 | 职责 | 层 |
|------|------|-----|
| `graph.py` | 图数据结构 + 最短路径算法 (Dijkstra) | 后端 |
| `summon.py` | 数据模型和业务逻辑 | 后端 |
| `main.py` | 后端入口，命令行调用 | 后端 |
| `gui_main.py` | 可视化界面（tkinter） | 前端 |
| `railway_data.json` | 铁路网络数据 | 数据 |

## 核心功能

- 全国铁路站点网络建模
- 最短路径查询（支持距离/时间/成本/中转四种权重）
- 图形化界面展示路线

## 用 CollabAI 协作开发

```bash
# Alice (后端) 接入
npm run chat -- --new-room "铁路网络" --user "Alice" -w ./demo/railway

# Bob (前端) 接入
npm run chat -- --room <room-id> --user "Bob" -w ./demo/railway
```
