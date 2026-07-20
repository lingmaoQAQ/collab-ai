# Mathematics Demo

这是 CollabAI 的示例项目 —— 一个群论可视化工具（使用 SymPy + NetworkX + Matplotlib）。

## 项目来源

来自 `D:\Mycode\mathematics` 的 `test.py`，是一个群论正规子群链可视化程序。
支持对称群 Sn、交错群 An、二面体群 Dn 的合成列和导出列可视化。

## 用 CollabAI 协作开发这个项目

```bash
# 启动 Gateway
npm run gateway -- --port 3000

# Alice（群论专家）接入
npm run chat -- --connect ws://localhost:3000 --room math --user Alice -w ./demo/mathematics

# Bob（性能优化专家）接入
npm run chat -- --connect ws://localhost:3000 --room math --user Bob -w ./demo/mathematics
```
