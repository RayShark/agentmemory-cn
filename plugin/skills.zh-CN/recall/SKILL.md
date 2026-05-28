---
name: recall
description: Search agentmemory for past observations, sessions, and learnings about a topic. Use when the user says "recall", "remember", "what did we do", or needs context from past sessions.
argument-hint: "[search query]"
user-invocable: true
---

用户想召回关于以下主题的历史上下文：$ARGUMENTS

使用 `memory_smart_search` MCP 工具（由该插件自动通过 `.mcp.json` 连接的 agentmemory server 提供），把用户查询作为 `query` 参数，`limit: 10`。该工具会在已捕获的 observations 上执行混合 BM25 + vector + graph-expanded search，并返回排序后的结果。

用易读格式向用户展示返回结果：
- 按 session 分组
- 每条 observation 展示 type、title、narrative
- 突出展示最重要的 observations（importance >= 7）
- 如果没有返回结果，建议 2-3 个可尝试的替代搜索词

**不要编造或幻觉 observations。** 只展示 MCP 工具实际返回的内容。如果 `memory_smart_search` 不可用，说明 stdio MCP shim 没有启动。告诉用户：
1. 在 Claude Code 中运行 `/plugin list`，确认 `agentmemory` 显示为 enabled。
2. 重启 Claude Code（插件的 `.mcp.json` 只在启动时读取）。
3. 检查 `/mcp`，确认 `agentmemory` MCP server 已连接。
