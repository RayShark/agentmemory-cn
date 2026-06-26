---
name: commit-context
description: 追踪文件、函数或代码行，找出生成当前提交的代理会话。用于用户询问“为什么这里是这样写的”、“这段改动时代理在做什么”，或想查看代码库某个位置的上下文时。
argument-hint: "[文件、函数或行]"
user-invocable: true
---

用户想查看以下目标的提交上下文：$ARGUMENTS

对 $ARGUMENTS 中的目标文件、函数或行运行 `git blame`（或 `git log -L`），提取最近一次修改它的提交 SHA。给出行范围时使用 `git blame -L <start>,<end> <file>`，给出函数名时使用 `git log -L :<function>:<file>`，只给出路径时使用 `git log -n 1 -- <file>`。

拿到 SHA 后，使用 `memory_commit_lookup` MCP 工具查询关联的代理会话，参数为 `sha: "<full-sha>"`。如果 MCP 工具不可用，回退到 HTTP：当设置了密钥时，用 `Authorization: Bearer $AGENTMEMORY_SECRET` 请求 `GET $AGENTMEMORY_URL/agentmemory/session/by-commit?sha=<sha>`。

按以下格式展示结果：
- 提交 SHA、短 SHA、分支、作者、提交消息
- 关联会话：ID、项目、开始/结束时间戳、观察数量、摘要（如果有）
- 如果可通过 `memory_recall` 获取，列出该会话中最重要的观察（importance >= 7）

不要编造意图。如果提交没有关联会话，就明确说明，并只展示 `git show` 能证明的信息。如果 `memory_commit_lookup` 返回空的 `commit: null` 响应正文，说明这个提交早于会话链接，不要虚构会话。
