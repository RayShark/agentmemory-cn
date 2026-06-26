---
name: recap
description: 总结当前项目最近 N 个代理会话，并按日期分组。用于用户要“recap”、“最近都在做什么”、“这周”、“今天”，或想汇总近期工作时。
argument-hint: "[last N | today | this week]"
user-invocable: true
---

用户想要一份回顾。时间窗口参数：$ARGUMENTS

解析 `$ARGUMENTS` 来确定窗口：
- `today` -> 本地当前日期开始的会话
- `this week` -> 最近 7 天开始的会话
- `last <n>` -> 最近 N 个会话
- 裸数字 -> 按 `last <n>` 处理
- 空参数 -> 默认 `last 10`

调用 `memory_sessions` MCP 工具，然后过滤到当前项目（用工作目录匹配 `cwd`）。应用时间窗口，按 `startedAt` 倒序排序。

按本地日历日期（YYYY-MM-DD）对保留下来的会话分组。每个日期下：
- 列出每个会话：ID（前 8 位）、标题或首次提示、观察数量、状态
- 每个会话缩进列出 2-3 条高亮观察（importance >= 7），这些内容通过针对该会话的查询调用 `memory_recall` 获取，`limit: 3`

最后用一行中文总计结束，保留数字原样，例如："共 N 个会话，覆盖 M 天，K 条观察。"

如果 MCP 工具不可用，回退到 HTTP：当设置了密钥时，用 `Authorization: Bearer $AGENTMEMORY_SECRET` 请求 `GET $AGENTMEMORY_URL/agentmemory/sessions` 和 `POST $AGENTMEMORY_URL/agentmemory/recall`。不要编造会话；如果窗口为空，就直接说明。
