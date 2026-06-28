---
name: agentmemory-rest-api
description: 说明 agentmemory HTTP REST API，这是与记忆服务器通信的主协议。用于通过 HTTP 调用 agentmemory、MCP 不可用需要回退，或集成不支持 MCP 的宿主时。
user-invocable: true
---

REST 是 agentmemory 的主接口；MCP 是建立在它之上的桥。所有记忆操作都位于 `http://localhost:3111/agentmemory/*`。

## 快速开始

```bash
# liveness
curl -fsS http://localhost:3111/agentmemory/livez

# save
curl -X POST http://localhost:3111/agentmemory/remember \
  -H "Content-Type: application/json" \
  -d '{"content":"chose JWT refresh rotation","concepts":["jwt-refresh-rotation"]}'

# recall
curl -X POST http://localhost:3111/agentmemory/smart-search \
  -H "Content-Type: application/json" \
  -d '{"query":"auth token strategy","limit":5}'
```

## 鉴权

默认 localhost 开放，不需要鉴权。设置 `AGENTMEMORY_SECRET` 后，每个请求都要带 `Authorization: Bearer $AGENTMEMORY_SECRET`。详见 agentmemory-config。

## 约定

- 保存返回 `201`，读取返回 `200`，校验错误返回 `400`。
- Handler 会白名单过滤 body 字段并忽略未知字段。
- 端口可通过 `--port` 或 `--instance` 配置；streams、viewer 和 engine 端口由它派生。

## 参考

完整 endpoint 和 method 列表见 REFERENCE.md，由 `src/triggers/api.ts` 生成。
