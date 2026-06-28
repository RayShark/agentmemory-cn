---
name: agentmemory-config
description: 说明 agentmemory 配置、环境变量、端口和功能开关。用于启用功能、修改端口、设置 API key、配置鉴权，或解释某个功能为什么默认关闭时。
user-invocable: true
---

agentmemory 从环境变量和 `~/.agentmemory/.env` 读取配置。`.env` 每行一个 `KEY=value`，不需要 `export` 前缀。修改后请重启服务器。

## 快速开始

在 `~/.agentmemory/.env` 中启用更丰富的记忆并设置 provider key：

```env
ANTHROPIC_API_KEY=sk-ant-...
AGENTMEMORY_AUTO_COMPRESS=true
AGENTMEMORY_INJECT_CONTEXT=true
```

## 默认值

- 不需要 API key。没有 key 时，agentmemory 仍可用 BM25 加本地 embeddings 零 LLM 运行。
- 会花 token 的功能默认关闭：`AGENTMEMORY_AUTO_COMPRESS` 和 `AGENTMEMORY_INJECT_CONTEXT` 都会随工具调用频率消耗 token。
- 工具可见性：`AGENTMEMORY_TOOLS=all`（默认）或 `core`。
- 鉴权：设置 `AGENTMEMORY_SECRET` 后，REST API 需要 `Authorization: Bearer`。

## 端口

REST 锚定在 3111。Streams = N+1（3112），viewer = N+2（3113），engine = N+46023（49134）。可用 `--port <N>` 或 `--instance <N>` 平移。

## 参考

完整环境变量列表见 REFERENCE.md，由源码扫描生成。
