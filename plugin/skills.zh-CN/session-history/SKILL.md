---
name: session-history
description: Show what happened in recent past sessions on this project. Use when user asks "what did we do last time", "session history", "past sessions", or wants an overview of previous work.
user-invocable: true
---

使用 `memory_sessions` MCP 工具获取最近的 session history（该工具由插件通过 `.mcp.json` 自动连接的 agentmemory server 提供）。传入 `limit: 20`，得到一个有意义的窗口。

按倒序时间展示返回的 sessions：
- 展示 session ID（前 8 位）、project、start time、status
- 对每个有 observations 的 session，展示关键 highlights（type + title）
- 标明每个 session 的总 observation count
- 如果存在 session summary，展示 title 和关键决策

格式化为清晰的时间线。**不要编造 sessions**，只展示工具实际返回的内容。如果 `memory_sessions` 不可用，说明 stdio MCP shim 没有启动。告诉用户：
1. 在 Claude Code 中运行 `/plugin list`，确认 `agentmemory` 显示为 enabled。
2. 重启 Claude Code（插件的 `.mcp.json` 只在启动时读取）。
3. 检查 `/mcp`，确认 `agentmemory` MCP server 已连接。
