明确保存一条 insight、decision 或 learning 到 agentmemory，供未来 session 使用。封装 `memory_save` MCP 工具。

## Usage

```
/remember [what to remember]
```

## Instructions

1. 分析需要被记住的内容，提取核心 insight、decision 或 fact。
2. 提取 2-5 个可搜索的 concepts（小写关键词短语）。优先选择具体词（例如 `"jwt-refresh-rotation"`），而不是泛泛的词（例如 `"auth"`）。
3. 提取该记忆引用的相关 file paths。
4. 调用 `memory_save`：
   - `content`：要记住的完整文本（保留用户原话）
   - `concepts`：提取出的概念列表
   - `files`：提取出的文件列表（没有时为空数组）
   - `type`：从 pattern、preference、architecture、bug、workflow、fact 中选择
5. 确认保存完成，并展示已标记的 concepts，让用户知道之后可用哪些词检索。
