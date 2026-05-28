---
name: commit-context
description: Trace a file, function, or line back to the agent session that produced its current commit. Use when the user asks "why is this code here", "what was the agent doing when this changed", or wants context on a specific location in the codebase.
argument-hint: "[file, function, or line]"
user-invocable: true
---

用户想查看以下目标的提交上下文：$ARGUMENTS

对 $ARGUMENTS 中的目标文件、函数或行运行 `git blame`（或 `git log -L`），提取最近一次触碰它的 commit SHA。给出行范围时使用 `git blame -L <start>,<end> <file>`，给出函数名时使用 `git log -L :<function>:<file>`，只给出路径时使用 `git log -n 1 -- <file>`。

拿到 SHA 后，使用 `memory_commit_lookup` MCP 工具查询关联的 agent session，参数为 `sha: "<full-sha>"`。如果 MCP 工具不可用，回退到 HTTP：当设置了 secret 时，用 `Authorization: Bearer $AGENTMEMORY_SECRET` 请求 `GET $AGENTMEMORY_URL/agentmemory/session/by-commit?sha=<sha>`。

按以下格式展示结果：
- commit SHA、短 SHA、branch、author、message
- 关联 session：id、project、started/ended 时间戳、observation count、summary（如果有）
- 如果可通过 `memory_recall` 获取，列出该 session 中最重要的 observations（importance >= 7）

不要编造意图。如果 commit 没有关联 session，就明确说明，并只展示 `git show` 能证明的信息。如果 `memory_commit_lookup` 返回空的 `commit: null` body，说明这个 commit 早于 session linking，不要虚构 session。
