---
name: agentmemory-architecture
description: 说明 agentmemory 的构建方式、iii engine 原语、存储模型、端口和查看器。用于端到端推理记忆如何存储或检索、扩展系统，或回答 agentmemory 底层如何工作时。
user-invocable: true
---

agentmemory 是面向编码代理的本地记忆服务器。它捕获观察、建立混合检索索引，并通过 REST 和 MCP 提供给后续会话。系统构建在 iii engine 之上。

## iii 原语

所有能力都是 iii engine 上的 function、trigger 或 worker state。worker 注册 `mem::*` 函数和 `api::*` HTTP trigger，由 engine 负责路由调用。不要绕过 iii 直接接入独立 SQLite 或进程内替代方案。

## 检索模型

召回是混合检索：BM25 关键词搜索、向量相似度，以及围绕概念链接的图谱扩展。默认安装不需要 API key；LLM provider 只用于更丰富的摘要和自动注入，而且都是显式开启。

## 存储生命周期

记忆包含内容、概念、文件、重要性和时间戳，归属到 session，也可关联 commit。capture、compress、consolidate、forget 组成生命周期，避免记忆库无限膨胀。

## 端口

REST 锚定在 3111。Streams = N+1（3112），viewer = N+2（3113），engine = N+46023（49134）。`--instance N` 会把整组端口平移 N*100。

## 查看器

实时查看器位于 `http://localhost:3113`，可观察会话运行时记忆如何生成。它适合 demo，也适合确认自动捕获是否正常。

## 参考

- agentmemory-mcp-tools 和 agentmemory-rest-api 说明对外接口。
- agentmemory-hooks 说明自动捕获。
- agentmemory-config 说明端口和功能开关。
