---
name: handoff
description: Resume the most recent agent session for the current working directory. Use when the user says "where were we", "resume", "handoff", "pick up where I left off", or starts a session with no fresh context.
argument-hint: "[optional cwd override]"
user-invocable: true
---

用户想恢复之前的工作。可选 cwd override：$ARGUMENTS

确定当前项目路径：如果提供了 `$ARGUMENTS`，将其解析为绝对、规范化路径（接受相对输入，例如 `path.resolve(process.cwd(), $ARGUMENTS)`）；否则使用当前工作目录。

调用 `memory_sessions` MCP 工具。从结果中选择最近的一个 session，要求其规范化后的 `cwd` 与项目路径按目录边界匹配：相等，或者 `session.cwd.startsWith(projectPath + path.sep)`，或者 `projectPath.startsWith(session.cwd + path.sep)`。不要使用原始字符串前缀匹配，因为共享路径前缀的无关仓库会误命中（例如 `/repo-a` 与 `/repo-a-staging`）。优先选择状态为 `completed` 的 session，而不是 `abandoned`。如果没有匹配项，回退到全局最近的单个 session。

选定 session 后：
1. 如果 session 结束在一个尚未回答的用户问题上，先把这个问题放在开头。可在 `summary` 或最后几条 observations 中查找（type 为 `conversation` 且 `narrative` 以 `?` 结尾）。
2. 然后总结该 session：title/summary、关键修改文件、关键决策或错误。用该 session 的 top concepts 派生查询，调用 `memory_recall` 获取支撑 observations，`limit: 10`。
3. 最后用一条简短的 "next step?" 指向用户可以继续执行的动作。

如果两个 MCP 工具都不可用，回退到 HTTP：当设置了 secret 时，用 `Authorization: Bearer $AGENTMEMORY_SECRET` 请求 `GET $AGENTMEMORY_URL/agentmemory/sessions` 和 `POST $AGENTMEMORY_URL/agentmemory/recall`。

不要编造 observations。如果最近的 session 没有 observations，就说明这一点，并提出从当前上下文重新开始。
