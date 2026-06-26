---
name: remember
description: 将一条洞察、决策或经验显式保存到 agentmemory 的长期存储中。用于用户说“记住这个”、“保存一下”，或想保留供未来会话使用的知识时。
argument-hint: "[要记住的内容]"
user-invocable: true
---

用户想把以下内容保存到长期记忆：$ARGUMENTS

使用 `memory_save` MCP 工具（由该插件自动通过 `.mcp.json` 连接的 agentmemory 服务器提供）持久化它。

步骤：
1. 分析用户想记住什么，提取核心洞察、决策或事实。
2. 提取 2-5 个可搜索的 `concepts`（小写关键词短语），捕捉这条记忆的主题。优先使用具体词，而不是泛泛的词（`"jwt-refresh-rotation"` 优于 `"auth"`）。
3. 提取任何相关 `files`：该记忆引用的绝对路径或仓库相对路径。
4. 调用 `memory_save`，字段如下：
   - `content`：要记住的完整文本（尽量保留用户原话）
   - `concepts`：提取出的概念列表
   - `files`：提取出的文件列表（没有时为空数组）
5. 向用户确认记忆已保存，并展示标记的概念，让用户知道之后可用哪些词检索。

如果 `memory_save` 不可用，说明 stdio MCP 适配层没有启动。告诉用户：
1. 在 Claude Code 中运行 `/plugin list`，确认 `agentmemory` 显示为 enabled。
2. 重启 Claude Code（插件的 `.mcp.json` 只在启动时读取）。
3. 检查 `/mcp`，确认 `agentmemory` MCP 服务器已连接。
