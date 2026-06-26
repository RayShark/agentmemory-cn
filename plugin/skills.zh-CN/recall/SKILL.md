---
name: recall
description: 在 agentmemory 中搜索某个主题的过往观察、会话和经验。用于用户说“recall”、“remember”、“我们做了什么”，或需要过去会话上下文时。
argument-hint: "[搜索查询]"
user-invocable: true
---

用户想召回关于以下主题的历史上下文：$ARGUMENTS

使用 `memory_smart_search` MCP 工具（由该插件自动通过 `.mcp.json` 连接的 agentmemory 服务器提供），把用户查询作为 `query` 参数，`limit: 10`。该工具会在已捕获的观察上执行混合 BM25 + 向量 + 图谱扩展搜索，并返回排序后的结果。

用易读格式向用户展示返回结果：
- 按会话分组
- 每条观察展示类型、标题和叙述内容
- 突出展示最重要的观察（importance >= 7）
- 如果没有返回结果，建议 2-3 个可尝试的替代搜索词

**不要编造观察。** 只展示 MCP 工具实际返回的内容。如果 `memory_smart_search` 不可用，说明 stdio MCP 适配层没有启动。告诉用户：
1. 在 Claude Code 中运行 `/plugin list`，确认 `agentmemory` 显示为 enabled。
2. 重启 Claude Code（插件的 `.mcp.json` 只在启动时读取）。
3. 检查 `/mcp`，确认 `agentmemory` MCP 服务器已连接。
