---
name: forget
description: 从 agentmemory 中删除指定的观察或会话。用于用户说“忘掉这个”、“删除记忆”，或想出于隐私移除特定数据时。
argument-hint: "[要忘记的内容：会话 ID、文件路径或搜索词]"
user-invocable: true
---

用户想从 agentmemory 中删除数据：$ARGUMENTS

**重要**：这是破坏性操作。删除前必须先向用户确认。

步骤：

1. 先用 `memory_smart_search` MCP 工具搜索匹配的观察（该工具由插件通过 `.mcp.json` 连接的 agentmemory 服务器提供）。使用用户输入作为 `query`，`limit: 20`。
2. 向用户展示找到的内容，包括会话 ID、观察 ID 和标题，并在删除前请求明确确认。
3. 用户确认后，调用 `memory_governance_delete`：
   - `memoryIds: [<id>, ...]`：步骤 1 返回的 memory ID 数组（或逗号分隔字符串）
   - `reason: "<简短原因>"`：可选，默认 `"plugin skill request"`

   如果用户要删除整个会话的观察，从搜索结果中收集该会话的每个记忆 ID，并全部传入 `memoryIds`。独立 MCP 不接受裸 `sessionId` 参数；它只能按记忆 ID 删除。
4. 向用户确认删除数量。

**没有用户明确确认，绝不删除。** 如果 MCP 工具不可用，说明 stdio MCP 适配层没有启动。告诉用户：
1. 在 Claude Code 中运行 `/plugin list`，确认 `agentmemory` 显示为 enabled。
2. 重启 Claude Code（插件的 `.mcp.json` 只在启动时读取）。
3. 检查 `/mcp`，确认 `agentmemory` MCP 服务器已连接。
