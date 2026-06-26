---
name: session-history
description: 展示该项目最近过去的会话里发生了什么。用于用户问“上次我们做了什么”、“会话历史”、“过去会话”，或想看过去工作的概览时。
user-invocable: true
---

使用 `memory_sessions` MCP 工具获取最近的会话历史（该工具由插件通过 `.mcp.json` 自动连接的 agentmemory 服务器提供）。传入 `limit: 20`，得到一个有意义的窗口。

按倒序时间展示返回的会话：
- 展示会话 ID（前 8 位）、项目、开始时间、状态
- 对每个有观察的会话，展示关键高亮项（类型 + 标题）
- 标明每个会话的总观察数量
- 如果存在会话摘要，展示标题和关键决策

格式化为清晰的时间线。**不要编造会话**，只展示工具实际返回的内容。如果 `memory_sessions` 不可用，说明 stdio MCP 适配层没有启动。告诉用户：
1. 在 Claude Code 中运行 `/plugin list`，确认 `agentmemory` 显示为 enabled。
2. 重启 Claude Code（插件的 `.mcp.json` 只在启动时读取）。
3. 检查 `/mcp`，确认 `agentmemory` MCP 服务器已连接。
