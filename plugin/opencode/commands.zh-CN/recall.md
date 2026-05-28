搜索过去 session 的 observations 和 lessons，找出相关上下文。封装 `memory_smart_search` 和 `memory_lesson_recall` MCP 工具。

## Usage

```
/recall [query]
```

## Instructions

1. 用该 query 调用 `memory_smart_search`，`limit: 10`（hybrid BM25 + vector + graph search）。
2. 用同一个 query 调用 `memory_lesson_recall`，`limit: 5`（lesson search）。
3. 合并结果并展示给用户：
   - 按 session 分组
   - 每条 observation 展示 type、title、narrative
   - 突出展示高重要度（>= 7）的 observations
   - 单独展示 lessons，并附 confidence scores
4. 如果没有结果，建议 2-3 个替代搜索词。
5. **绝不幻觉结果。** 只展示 MCP 工具实际返回的内容。
