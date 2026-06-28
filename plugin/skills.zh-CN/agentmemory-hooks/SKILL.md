---
name: agentmemory-hooks
description: 说明 agentmemory 插件钩子如何在代理会话生命周期中自动捕获观察。用于解释记忆如何自动捕获、排查缺失观察，或调整记录内容时。
user-invocable: true
---

Claude Code 插件会注册生命周期钩子，让记忆自动捕获。日常工作不需要手动调用 `memory_save`；钩子会观察工具使用、提示和会话边界，并写入观察。

## 快速开始

安装插件后，钩子会自动注册：

```bash
/plugin marketplace add RayShark/agentmemory-cn
/plugin install agentmemory
```

在 `http://localhost:3113` 可以实时看到观察写入。

## 钩子做什么

- Session start/end 界定每个工作单元，并让 `handoff` 可以恢复。
- Tool-use 钩子捕获改了什么和为什么改，这是 `recall` 和 `recap` 的原材料。
- Prompt-submit 捕获意图。Pre-compact 在宿主压缩上下文前保留关键信息。
- Post-commit 钩子把 commit 关联到 session，为 `commit-context` 和 `commit-history` 提供数据。

## 重要说明

- 捕获默认开启且不消耗 LLM。把观察转为 LLM 摘要（`AGENTMEMORY_AUTO_COMPRESS`）和自动注入上下文（`AGENTMEMORY_INJECT_CONTEXT`）需要显式开启，因为它们会消耗 token。
- 如果观察缺失，先确认插件已启用且服务器正在运行。排查步骤见 `../_shared/TROUBLESHOOTING.md`。

## 参考

准确的钩子事件列表见 REFERENCE.md，由 `plugin/hooks/hooks.json` 生成。
