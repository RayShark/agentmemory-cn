---
name: commit-history
description: 列出与代理会话关联的最近 git 提交，可按分支或仓库过滤。用于用户想看“代理提交了什么”、“它最近做了什么”，或想要带会话上下文的提交列表时。
argument-hint: "[branch=... repo=... limit=...]"
user-invocable: true
---

用户想查看代理关联的提交列表。过滤参数：$ARGUMENTS

解析 `$ARGUMENTS` 中可选的 `branch=<name>`、`repo=<url-or-fragment>` 和 `limit=<n>` 参数。单独的数字参数视为 limit。默认：不按分支过滤，不按仓库过滤，limit 为 100，最大 500。

用解析出的过滤条件调用 `memory_commits` MCP 工具。如果 MCP 工具不可用，回退到 HTTP：构造 `GET $AGENTMEMORY_URL/agentmemory/commits`，并把每个过滤条件作为 URL 编码后的查询参数追加进去（对 `branch`、`repo`、`limit` 使用 `URLSearchParams` 或 `encodeURIComponent`），避免包含 `?`、`&` 或 `#` 的值破坏请求。当设置了密钥时，带上 `Authorization: Bearer $AGENTMEMORY_SECRET`。

按倒序时间展示结果：
- 短 SHA、分支、作者时间戳
- 提交消息第一行
- 关联会话 ID（每个取前 8 位）和观察数量（如果有）
- `files` 存在时展示文件数量

如果结果为空，告诉用户过滤条件没有匹配到提交，并建议去掉分支/仓库过滤条件。不要编造提交。
