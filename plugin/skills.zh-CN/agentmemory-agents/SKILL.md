---
name: agentmemory-agents
description: 说明 agentmemory 如何通过 connect 命令接入宿主编码代理。用于安装到指定代理、询问支持哪些代理，或 connect 适配器写入了错误配置路径时。
user-invocable: true
---

`agentmemory connect <agent>` 会把记忆服务器合并进宿主代理配置，并保留已有服务器。底层协议是 REST；只支持 MCP 的宿主会接入 stdio MCP 桥。

## 快速开始

```bash
agentmemory connect claude-code   # 也可用 cursor、codex、gemini-cli 等
```

接线后，重启宿主或执行它的 MCP reload（例如 Claude Code 中的 `/mcp`），让它加载服务器。然后确认代理能看到 agentmemory 工具。

## 工作流

1. 识别当前宿主代理；如果未知，默认按 `claude-code` 处理。
2. 用 REFERENCE.md 表格中的名称运行 `agentmemory connect <name>`。
3. 验证宿主显示完整工具集，并且服务器正在运行。只看到 7 个工具通常表示 MCP 适配层无法连接服务器，请看 `../_shared/TROUBLESHOOTING.md`。

## 注意

- `remember`、`recall` 等动作技能需要另外通过 `npx skills add RayShark/agentmemory-cn` 安装。`connect` 负责让工具可用，skills 负责告诉代理何时使用工具。
- Windows 建议使用 WSL2。原生 Windows 可以运行服务器，但 `connect` 暂不支持。

## 参考

完整适配器列表和协议说明见 REFERENCE.md，由 `src/cli/connect/` 生成。
