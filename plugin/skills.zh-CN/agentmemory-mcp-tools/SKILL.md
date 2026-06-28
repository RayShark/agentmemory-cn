---
name: agentmemory-mcp-tools
description: 汇总每个 agentmemory MCP 工具的用途和参数。用于选择该调用哪个记忆工具、工具名或参数不清楚，或回答 agentmemory 通过 MCP 能做什么时。
user-invocable: true
---

agentmemory 把完整能力暴露为 MCP 工具。这个技能是索引：它告诉你该用哪个工具，以及在哪里查看准确参数。

## 快速开始

先保存，再召回：

1. 调用 `memory_save`，传入 `content`（洞察）、`concepts`（逗号分隔关键词）、`files`（逗号分隔路径）。
2. 调用 `memory_smart_search`，传入 `query` 和 `limit` 稍后检索。它会执行 BM25、向量和图谱扩展的混合搜索。

## 工具家族

- 捕获：`memory_save`、`memory_observe` 流程、`memory_compress_file`。
- 检索：`memory_smart_search`、`memory_recall`、`memory_file_history`、`memory_timeline`、`memory_vision_search`。
- 会话和提交：`memory_sessions`、`memory_commits`、`memory_commit_lookup`。
- 知识和图谱：`memory_lesson_save`、`memory_lesson_recall`、`memory_graph_query`、`memory_relations`、`memory_patterns`、`memory_crystallize`。
- 结构化槽：`memory_slot_create`、`memory_slot_append`、`memory_slot_get`、`memory_slot_list`、`memory_slot_replace`、`memory_slot_delete`。
- 治理和健康：`memory_governance_delete`、`memory_audit`、`memory_verify`、`memory_heal`、`memory_diagnose`。

## 工作流

1. 为任务选择最窄的工具。开放式召回优先用 `memory_smart_search`；已有明确查询时用 `memory_recall`；列会话用 `memory_sessions`。
2. 调用前在 REFERENCE.md 查询准确参数名和必填字段。
3. 只传文档中列出的字段。REST handler 会白名单过滤字段，未知字段会被忽略。

## 参考

完整工具表、参数和 core 标记见 REFERENCE.md，由源码生成以避免漂移。
