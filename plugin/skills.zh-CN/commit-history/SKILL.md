---
name: commit-history
description: List recent git commits that are linked to agent sessions, optionally filtered by branch or repo. Use when the user asks "show agent commits", "what has the agent shipped", or wants a list of commits with their session context.
argument-hint: "[branch=... repo=... limit=...]"
user-invocable: true
---

用户想查看 agent 关联的 commit 列表。过滤参数：$ARGUMENTS

解析 `$ARGUMENTS` 中可选的 `branch=<name>`、`repo=<url-or-fragment>` 和 `limit=<n>` token。单独的数字 token 视为 limit。默认：不按 branch 过滤，不按 repo 过滤，limit 为 100，最大 500。

用解析出的过滤条件调用 `memory_commits` MCP 工具。如果 MCP 工具不可用，回退到 HTTP：构造 `GET $AGENTMEMORY_URL/agentmemory/commits`，并把每个过滤条件作为 URL 编码后的 query parameter 追加进去（对 `branch`、`repo`、`limit` 使用 `URLSearchParams` 或 `encodeURIComponent`），避免包含 `?`、`&` 或 `#` 的值破坏请求。当设置了 secret 时，带上 `Authorization: Bearer $AGENTMEMORY_SECRET`。

按倒序时间展示结果：
- 短 SHA、branch、authored timestamp
- commit message 第一行
- 关联 session id（每个取前 8 位）和 observation count（如果有）
- `files` 存在时展示 file count

如果结果为空，告诉用户过滤条件没有匹配到 commit，并建议去掉 branch/repo filter。不要编造 commit。
