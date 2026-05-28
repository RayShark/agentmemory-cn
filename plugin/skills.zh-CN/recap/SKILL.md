---
name: recap
description: Summarize the last N agent sessions for the current project, grouped by date. Use when the user asks "recap", "what have we been doing", "this week", "today", or wants a rollup of recent work.
argument-hint: "[last N | today | this week]"
user-invocable: true
---

用户想要一份回顾。时间窗口参数：$ARGUMENTS

解析 `$ARGUMENTS` 来确定窗口：
- `today` -> 本地当前日期开始的 sessions
- `this week` -> 最近 7 天开始的 sessions
- `last <n>` -> 最近 N 个 sessions
- 裸数字 -> 按 `last <n>` 处理
- 空参数 -> 默认 `last 10`

调用 `memory_sessions` MCP 工具，然后过滤到当前项目（用工作目录匹配 `cwd`）。应用时间窗口，按 `startedAt` 倒序排序。

按本地日历日期（YYYY-MM-DD）对保留下来的 sessions 分组。每个日期下：
- 列出每个 session：id（前 8 位）、title 或 first prompt、observation count、status
- 每个 session 缩进列出两到三条 highlight observations（importance >= 7），这些内容通过针对该 session 的查询调用 `memory_recall` 获取，`limit: 3`

最后用一行中文总计结束，保留数字原样，例如："共 N 个会话，覆盖 M 天，K 条观察。"

如果 MCP 工具不可用，回退到 HTTP：当设置了 secret 时，用 `Authorization: Bearer $AGENTMEMORY_SECRET` 请求 `GET $AGENTMEMORY_URL/agentmemory/sessions` 和 `POST $AGENTMEMORY_URL/agentmemory/recall`。不要编造 sessions；如果窗口为空，就直接说明。
