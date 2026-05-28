---
name: forget
description: Delete specific observations or sessions from agentmemory. Use when user says "forget this", "delete memory", or wants to remove specific data for privacy.
argument-hint: "[what to forget - session ID, file path, or search term]"
user-invocable: true
---

用户想从 agentmemory 中删除数据：$ARGUMENTS

**重要**：这是破坏性操作。删除前必须先向用户确认。

步骤：

1. 先用 `memory_smart_search` MCP 工具搜索匹配的 observations（该工具由插件通过 `.mcp.json` 连接的 agentmemory server 提供）。使用用户输入作为 `query`，`limit: 20`。
2. 向用户展示找到的内容，包括 session IDs、observation IDs、titles，并在删除前请求明确确认。
3. 用户确认后，调用 `memory_governance_delete`：
   - `memoryIds: [<id>, ...]`：步骤 1 返回的 memory ID 数组（或逗号分隔字符串）
   - `reason: "<short reason>"`：可选，默认 `"plugin skill request"`

   如果用户要删除整个 session 的 observations，从搜索结果中收集该 session 的每个 memory ID，并全部传入 `memoryIds`。standalone MCP 不接受裸 `sessionId` 参数；它只能按 memory ID 删除。
4. 向用户确认删除数量。

**没有用户明确确认，绝不删除。** 如果 MCP 工具不可用，说明 stdio MCP shim 没有启动。告诉用户：
1. 在 Claude Code 中运行 `/plugin list`，确认 `agentmemory` 显示为 enabled。
2. 重启 Claude Code（插件的 `.mcp.json` 只在启动时读取）。
3. 检查 `/mcp`，确认 `agentmemory` MCP server 已连接。
