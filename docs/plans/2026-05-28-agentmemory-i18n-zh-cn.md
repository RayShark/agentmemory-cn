# agentmemory 全中文与多语言适配 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 agentmemory 通过 `AGENTMEMORY_LOCALE=zh-CN` 切换为中文默认体验，并建立后续社区可维护的多语言框架。

**Architecture:** 新增统一 `src/i18n/` 层解析 locale、加载文案、提供 prompt 语言约束；Viewer、MCP、REST、CLI、hooks、plugin skills 和 LLM prompt 都消费同一 locale 决策。API 字段名、枚举值、XML/JSON tag 和 MCP tool name 保持英文稳定，只本地化面向人的自然语言。

**Tech Stack:** TypeScript ESM、iii-sdk、Vitest、静态 Viewer HTML/CSS/JS、JSON locale resources、Codex/Claude plugin Markdown skills。

---

> 当前文档只规划改造，不实现功能代码。分支：`plan/agentmemory-i18n-zh-cn`。

## 目标

增加一个统一配置项，让 agentmemory 可以把默认用户可见语言切换为中文，并把这套能力做成可维护的多语言框架。首个落地目标是 `zh-CN`，覆盖 Viewer、MCP/REST/CLI 文案、LLM 生成内容、上下文注入、插件 skills、OpenCode 命令、回放标签、审计/动态/任务/结晶/画像等默认输出。

推荐配置名：

```bash
AGENTMEMORY_LOCALE=zh-CN
```

保留英文为默认值：

```bash
AGENTMEMORY_LOCALE=en
```

## 当前证据

当前仓库的语言来源不是一个点，而是分散在几类代码里：

- Viewer：`src/viewer/index.html` 内联了大量英文静态文案，涵盖 `Graph / Memories / Timeline / Sessions / Lessons / Actions / Crystals / Audit / Activity / Profile / Replay` 等页签和运行时状态。
- 已存在参考分支：`/home/xiazhourui/.config/superpowers/worktrees/agentmemory/viewer-zh-cn-locale` 的 `feat/viewer-zh-cn-locale` 已做过 Viewer locale 注入，包含 `src/viewer/locales.ts`、`src/viewer/locales/{en,de,zh}.json`、`test/viewer-i18n.test.ts`。这个分支可复用思路，但只覆盖 Viewer，且配置名是 `VIEWER_LANGUAGE`，没有解决核心记忆生成语言。
- LLM 提示词：主要在 `src/prompts/*.ts`，另有 `src/functions/crystallize.ts`、`src/functions/flow-compress.ts`、`src/functions/skill-extract.ts`、`src/functions/consolidate.ts`、`src/functions/temporal-graph.ts` 等文件内嵌英文 system prompt。
- 非 LLM 默认输出：`src/functions/compress-synthetic.ts`、`src/functions/profile.ts`、`src/functions/context.ts`、`src/replay/timeline.ts` 会生成英文标题、标签或上下文小节。
- MCP 工具描述：`src/mcp/tools-registry.ts` 全部是英文 description 和 input schema description。
- REST/CLI 错误与状态：`src/triggers/api.ts`、`src/cli.ts`、`src/cli/onboarding.ts`、`src/cli/doctor-diagnostics.ts` 存在大量英文错误、诊断、提示。
- 插件 skills：`plugin/skills/*/SKILL.md` 和 `plugin/opencode/commands/*.md` 是英文 agent-facing 指令；`plugin/opencode/agentmemory-capture.ts` 的 `AGENTMEMORY_INSTRUCTIONS` 也是英文。
- 构建流程：`package.json` 的 `build` 目前只复制 `src/viewer/index.html` 和 `favicon.svg`，如果新增 locale JSON 需要同步复制。

## 范围定义

本次“中文适配版”应覆盖：

- 图谱：Viewer 图谱页、图谱统计、图谱重建按钮、空状态、LLM 图谱抽取 prompt 的自然语言输出约束。
- 记忆：Viewer 记忆页、MCP/REST 记忆工具描述、`mem::remember` 默认标题、整合生成的长期记忆内容。
- 时间线：Viewer 时间线页、`mem::timeline` 原因文案、回放事件 label。
- 会话：Viewer 会话页、会话总结 prompt、session history skill。
- 经验：Lessons 页面、lesson skill、结晶/回放自动提取 lesson 的默认语言。
- 任务：Actions/Frontier/Routines/Leases/Sketches 相关 Viewer 文案和默认消息。中文 UI 建议用“任务”，不沿用旧分支里的“行动项”。
- 结晶：Crystals 页面和 `mem::crystallize` prompt。
- 审计：Audit 页面、audit operation 标签、删除/治理 skill。
- 动态：Activity 页面、live update 状态、hook statusMessage。
- 画像：Profile 页面、`mem::profile` 生成的 convention 文案、上下文注入里的 Project Profile 小节。
- 回放：Replay 页面、`src/replay/timeline.ts` 事件标签、导入 JSONL 后自动生成的结晶/经验。

不建议本轮翻译以下内容：

- API 字段名、枚举值、MCP tool name、REST path、XML/JSON tag name、KV scope 名称。
- 代码标识符、文件路径、命令、错误原文、第三方产品名。
- 已存在用户内容。旧数据不做批量翻译，只保证新生成内容按 locale 产出。

## 设计原则

1. 语言配置必须是全局的，不只影响 Viewer。
2. 存储结构和 API 合约保持英文稳定，避免破坏现有用户、测试和外部集成。
3. 生成内容的语言由 prompt 控制，结构化标签和 enum 不翻译。
4. 静态 UI 文案走资源文件，禁止继续散落在巨大 HTML 字符串里。
5. 插件 skills 需要中文版本，但不应靠运行时字符串替换硬拼 Markdown。
6. 每新增一种语言，只需要补 locale 资源、prompt 资源、skill 文档和测试矩阵，不应改业务逻辑。

## 推荐架构

新增统一 i18n 模块：

```text
src/i18n/
  index.ts
  locale.ts
  messages.ts
  prompts.ts
  locales/
    en.json
    zh-CN.json
```

职责：

- `resolveLocale()`：读取并规范化 locale。
- `t(locale, key, params)`：读取 UI/错误/标签文案，缺失时 fallback 到英文。
- `languageInstruction(locale)`：给 LLM prompt 使用的语言约束。
- `getPrompt(locale, promptId)` 或 prompt builder：返回对应语言的 system prompt。

配置优先级建议：

1. 显式请求参数：后续 REST/MCP 可以支持 `locale`，用于单次调用覆盖。
2. `AGENTMEMORY_LOCALE`：全局默认语言。
3. `VIEWER_LANGUAGE`：仅作为旧 Viewer 配置兼容入口，映射到 locale；后续文档标记为 deprecated。
4. 默认 `en`。

不建议自动读取系统 `LANG` 作为默认值。agentmemory 是后台服务，自动随系统 locale 变化容易让多人共享服务器出现不可预测的输出语言。

## LLM 提示词改造

所有 prompt builder 都接受 locale 或从配置读取 locale。`zh-CN` 下添加统一规则：

```text
所有面向人的自然语言字段必须使用简体中文。保留代码标识符、文件路径、命令、API 名称、枚举值、XML/JSON 标签和值域原样。
```

需要改造的文件：

- `src/prompts/compression.ts`
- `src/prompts/summary.ts`
- `src/prompts/graph-extraction.ts`
- `src/prompts/consolidation.ts`
- `src/prompts/reflect.ts`
- `src/prompts/vision.ts`
- `src/functions/crystallize.ts`
- `src/functions/flow-compress.ts`
- `src/functions/skill-extract.ts`
- `src/functions/consolidate.ts`
- `src/functions/temporal-graph.ts`

关键要求：

- XML/JSON 输出 schema 不变。
- `ObservationType`、`Memory.type`、`GraphNode.type`、relationship type 等 enum 保持英文。
- `title`、`subtitle`、`facts`、`narrative`、`concepts`、`keyDecisions`、`lessons`、`insight.content` 等可读内容按 locale 生成。
- 解析函数不需要因中文修改，测试重点放在 prompt 是否注入语言约束、解析器是否仍可解析中文内容。

## 非 LLM 默认输出改造

需要把硬编码英文输出迁移到 i18n：

- `src/functions/compress-synthetic.ts`
  - `"observation"` 改为 locale 文案。
  - synthetic narrative 不翻译用户/工具原文，但拼接标签可本地化。
- `src/replay/timeline.ts`
  - `"User prompt"`、`"Assistant response"`、`"Session start"`、`"Session end"`、`"tool ▸ call/result/error"` 本地化。
- `src/functions/profile.ts`
  - `"TypeScript project"`、`"Standard src/ directory structure"`、`"Has test files"`、`"Frequently uses: ..."` 本地化。
- `src/functions/context.ts`
  - `## Project Profile`、`Concepts`、`Key files`、`Conventions`、`Common errors`、`## Lessons Learned`、`Decisions`、`Files`、`## Session ...` 本地化。
- `src/functions/flow-compress.ts`
  - `Goal`、`Outcome`、`Steps`、`Discoveries`、`Lesson` 本地化。
- `src/functions/frontier.ts`、`src/functions/leases.ts`、`src/functions/routines.ts`、`src/functions/sketches.ts`
  - 默认消息、失败原因、任务状态展示文案本地化。

## Viewer 改造

可复用 `feat/viewer-zh-cn-locale` 的做法，但要调整为全局 locale：

- 新增或迁移：
  - `src/viewer/locales.ts`
  - `src/viewer/locales/en.json`
  - `src/viewer/locales/zh-CN.json`
- `src/viewer/document.ts` 注入 locale bundle。
- `src/auth.ts` 增加 locale placeholder 常量，或放到 Viewer 模块内。
- `src/viewer/index.html`：
  - 启动时读取 `window.__AM_LOCALE__`。
  - 提供 `t()`、`tRaw()`、参数替换、英文 fallback。
  - 只允许安全属性通过 `data-i18n-attr` 更新，避免翻译注入 `href/src/on*`。
  - 所有页签和页面文案迁移到 key。
- `package.json` build 脚本复制 `src/viewer/locales` 到 `dist/viewer/locales`。

Viewer 中文 key 必须覆盖用户列出的页面：

- `nav.graph` → `图谱`
- `nav.memories` → `记忆`
- `nav.timeline` → `时间线`
- `nav.sessions` → `会话`
- `nav.lessons` → `经验`
- `nav.actions` → `任务`
- `nav.crystals` → `结晶`
- `nav.audit` → `审计`
- `nav.activity` → `动态`
- `nav.profile` → `画像`
- `nav.replay` → `回放`

## MCP / REST / CLI 改造

MCP 工具本身名称保持英文，description 和 input schema description 可按 locale 返回：

- `src/mcp/tools-registry.ts`
  - `getAllTools(locale?)`
  - `getVisibleTools(locale?)`
  - tool definitions 的 name/schema shape 不变，只替换 description。
- `src/mcp/server.ts`
  - `mcp::tools::list` 使用当前 locale。
  - 错误消息可先保持英文，第二阶段迁移到 `t()`。
- `src/triggers/api.ts`
  - flags endpoint 的 label、description、enableHow 本地化。
  - 高频 user-facing error 迁移到 `t()`，低频内部错误可第二阶段处理。
- `src/cli.ts`、`src/cli/onboarding.ts`、`src/cli/doctor-diagnostics.ts`
  - status、doctor、onboarding、init 输出本地化。
  - 初期可先保证 `agentmemory status`、`doctor`、`init`、`demo` 的关键路径中文化。

## 插件 skills 和 OpenCode 命令

用户理解是正确的：内置 prompt 和 skill 都需要中文版本。不过不建议把每个 Markdown 文件复制后长期手工漂移；推荐资源化生成或双目录发布。

首版可采用低风险双目录：

```text
plugin/skills/
  recall/SKILL.md
  remember/SKILL.md
  ...
plugin/skills.zh-CN/
  recall/SKILL.md
  remember/SKILL.md
  ...
plugin/opencode/commands/
  recall.md
  remember.md
plugin/opencode/commands.zh-CN/
  recall.md
  remember.md
```

然后提供安装/打包选择：

- 默认 manifest 继续指向英文 `./skills/`。
- 中文用户可通过 `AGENTMEMORY_LOCALE=zh-CN agentmemory connect codex --with-hooks` 生成或选择中文 skills。
- 如果插件 manifest 不支持运行时条件，CLI connect 流程可以在安装时复制/生成 locale 对应的 plugin 目录。
- OpenCode 的 `AGENTMEMORY_INSTRUCTIONS` 需要按 locale 切换，至少提供中文常量和 `resolveLocale()`。

中长期更推荐生成式维护：

```text
plugin/skills-src/
  recall.en.md
  recall.zh-CN.md
scripts/build-localized-plugin.mjs
```

构建时输出 `plugin/skills/` 与 `plugin/skills.zh-CN/`，测试检查 key/文件数量一致。

## 文档与配置

需要同步：

- `.env.example`
  - 增加 `AGENTMEMORY_LOCALE=zh-CN` 示例。
  - 标注默认 `en`，支持 `zh-CN`，后续社区可加语言。
- `README.md`
  - 新增 “Language / Locale” 小节。
  - 说明中文化覆盖范围和不翻译 API 字段名。
  - 给出中文用户配置示例。
- `CONTRIBUTING.md`
  - 新增“如何贡献新语言”：补 JSON key、prompt、skills、测试。
- `plugin/.claude-plugin/plugin.json`、`plugin/.codex-plugin/plugin.json`
  - 若新增 locale skills 目录，需要描述策略或添加 marketplace 说明。

## 测试计划

新增/扩展测试：

- `test/i18n.test.ts`
  - `AGENTMEMORY_LOCALE` 默认 `en`。
  - `zh`、`zh-CN`、`zh_CN` 规范化为 `zh-CN`。
  - 非法值 fallback 到 `en`。
  - `t()` 缺 key fallback 到英文。
  - 参数替换安全且稳定。
- `test/prompts-i18n.test.ts`
  - 中文 locale 下每个 prompt 包含“简体中文”输出约束。
  - XML/JSON tag 和 enum 仍为英文。
- `test/viewer-i18n.test.ts`
  - locale bundle 注入。
  - 中文 nav 覆盖 12 个页签。
  - fallback 结构和英文 key 完全一致。
  - JSON 注入转义 `<`，避免 `</script>` breakout。
  - 属性 allowlist 不包含 `href/src/on*`。
- `test/mcp-i18n.test.ts`
  - `mcp::tools::list` 在 `AGENTMEMORY_LOCALE=zh-CN` 时返回中文 description。
  - tool name 和 input schema key 不变。
- `test/context-i18n.test.ts`
  - `mem::context` 中文 locale 下输出 `项目画像`、`经验` 等标题。
- `test/replay-i18n.test.ts`
  - `projectTimeline()` 中文 locale 下生成中文事件 label。
- `test/plugin-i18n.test.ts`
  - 中文 skills 文件数量与英文一致。
  - 每个中文 `SKILL.md` 保留 frontmatter `name`，`user-invocable` 等机器字段不翻译。

最终验证命令：

```bash
HOME="$(mktemp -d)" npm test
npm run build
```

如果需要人工验收 Viewer：

```bash
AGENTMEMORY_LOCALE=zh-CN npm run dev
# 打开 http://localhost:3113，检查图谱/记忆/时间线/会话/经验/任务/结晶/审计/动态/画像/回放
```

## 实施步骤

### 阶段 1：统一 locale 基础设施

- [ ] 创建失败测试 `test/i18n.test.ts`，覆盖默认 `en`、`zh`/`zh-CN`/`zh_CN` 规范化、非法值 fallback、参数替换、缺 key 英文 fallback。
- [ ] 新增 `src/i18n/locale.ts`，实现 `resolveLocale(raw?: string): "en" | "zh-CN"`。
- [ ] 新增 `src/i18n/messages.ts` 和 `src/i18n/locales/{en,zh-CN}.json`，实现 `t(locale, key, params)`。
- [ ] 新增 `src/i18n/prompts.ts`，实现 `languageInstruction(locale)`。
- [ ] 给 `src/config.ts` 增加 `getLocale()`，读取 `AGENTMEMORY_LOCALE`，兼容 `VIEWER_LANGUAGE`。
- [ ] 更新 `.env.example`，加入 `# AGENTMEMORY_LOCALE=zh-CN`。
- [ ] 运行 `HOME="$(mktemp -d)" npm test -- test/i18n.test.ts`，确认新测试通过。

验收：配置解析和 fallback 稳定，英文默认行为不变。

### 阶段 2：Viewer 全中文

- [ ] 从 `feat/viewer-zh-cn-locale` 参考分支迁移安全的 locale bundle 思路，不直接覆盖当前 `src/viewer/index.html`。
- [ ] 新增 `src/viewer/locales.ts`，读取 `getLocale()` 并构造 Viewer bundle。
- [ ] 修改 `src/viewer/document.ts`，注入 `window.__AM_LOCALE__`，并转义 `<`。
- [ ] 修改 `src/viewer/index.html`，加入 `t()`、`tRaw()`、参数替换、英文 fallback、属性 allowlist。
- [ ] 逐页迁移文案：图谱、记忆、时间线、会话、经验、任务、结晶、审计、动态、画像、回放。
- [ ] 保留当前分支已有的 timeline sort 状态，不能回退 `state.timeline.sortOrder`。
- [ ] 修改 `package.json` build 脚本，复制 `src/viewer/locales` 到 `dist/viewer/locales`。
- [ ] 新增/迁移 `test/viewer-i18n.test.ts`，覆盖中文 nav、fallback parity、CSP 注入安全。
- [ ] 运行 `HOME="$(mktemp -d)" npm test -- test/viewer-i18n.test.ts test/viewer-security.test.ts`。

验收：`AGENTMEMORY_LOCALE=zh-CN` 下 Viewer 12 个页签与主要页面中文显示，英文默认不变。

### 阶段 3：LLM 生成内容中文化

- [ ] 写 `test/prompts-i18n.test.ts`，锁定中文 prompt 包含简体中文约束，schema tag/enum 仍为英文。
- [ ] 将 `src/prompts/compression.ts` 改为 `buildCompressionSystem(locale)`，保留 `buildCompressionPrompt()` 的结构。
- [ ] 将 `src/prompts/summary.ts` 改为 `buildSummarySystem(locale)`、`buildReduceSystem(locale)`。
- [ ] 将 `src/prompts/graph-extraction.ts`、`src/prompts/consolidation.ts`、`src/prompts/reflect.ts`、`src/prompts/vision.ts` 改为 locale-aware builder。
- [ ] 修改调用点：`src/functions/compress.ts`、`summarize.ts`、`graph.ts`、`consolidation-pipeline.ts`、`reflect.ts`。
- [ ] 改造内嵌 prompt：`crystallize.ts`、`flow-compress.ts`、`skill-extract.ts`、`consolidate.ts`、`temporal-graph.ts`。
- [ ] 运行 `HOME="$(mktemp -d)" npm test -- test/prompts-i18n.test.ts test/crystallize.test.ts test/graph.test.ts`。

验收：中文 locale 下新压缩观察、总结、图谱节点属性、长期记忆、结晶、经验、skill extraction、reflect insights 的自然语言字段为中文。

### 阶段 4：非 LLM 默认输出中文化

- [ ] 写 `test/context-i18n.test.ts`，验证 `mem::context` 中文标题。
- [ ] 写 `test/replay-i18n.test.ts`，验证 `projectTimeline()` 中文事件 label。
- [ ] 修改 `src/functions/compress-synthetic.ts`，本地化 synthetic title/subtitle 的默认标签。
- [ ] 修改 `src/functions/profile.ts`，本地化 conventions。
- [ ] 修改 `src/functions/context.ts`，本地化上下文注入标题和字段标签。
- [ ] 修改 `src/replay/timeline.ts`，增加可传 locale 参数或读取 `getLocale()`。
- [ ] 修改 `src/functions/flow-compress.ts` 的 fallback summary label。
- [ ] 梳理 `frontier.ts`、`leases.ts`、`routines.ts`、`sketches.ts` 的用户可见默认消息，逐步迁移到 `t()`。
- [ ] 运行相关单测和 `HOME="$(mktemp -d)" npm test -- test/context-i18n.test.ts test/replay-i18n.test.ts`。

验收：无 LLM provider 的默认路径也能生成中文标题/上下文小节。

### 阶段 5：MCP / REST / CLI 中文化

- [ ] 写 `test/mcp-i18n.test.ts`，验证中文 tool descriptions，tool name/schema key 不变。
- [ ] 修改 `src/mcp/tools-registry.ts`，让 `getAllTools(locale?)`、`getVisibleTools(locale?)` 返回 locale-aware descriptions。
- [ ] 修改 `src/mcp/server.ts` 的 `tools/list` 调用路径。
- [ ] 修改 `src/triggers/api.ts` flags endpoint 的 label/description/enableHow。
- [ ] 先迁移高频 REST 错误：auth、query required、sessionId required、feature disabled。
- [ ] 修改 `src/cli.ts` status/doctor/init/demo/connect 主路径文案。
- [ ] 修改 `src/cli/onboarding.ts` 和 `src/cli/doctor-diagnostics.ts` 的主路径提示。
- [ ] 运行 `HOME="$(mktemp -d)" npm test -- test/mcp-i18n.test.ts test/mcp-standalone.test.ts test/diagnostics.test.ts`。

验收：中文用户在 MCP tool list、status、doctor、Viewer flags 看到中文说明。

### 阶段 6：插件 skills 和 OpenCode

- [ ] 写 `test/plugin-i18n.test.ts`，验证中文 skills 文件数量与英文一致，frontmatter 机器字段不翻译。
- [ ] 新增 `plugin/skills.zh-CN/*/SKILL.md`，覆盖 8 个 skills。
- [ ] 新增 `plugin/opencode/commands.zh-CN/{recall,remember}.md`。
- [ ] 修改 `plugin/opencode/agentmemory-capture.ts`，让 `AGENTMEMORY_INSTRUCTIONS` 按 locale 选择英文或中文。
- [ ] 确认 plugin manifest 是否能引用多 skills 目录；如果不能，调整 CLI connect 生成/复制策略。
- [ ] 更新 `plugin/.claude-plugin/plugin.json`、`plugin/.codex-plugin/plugin.json` 描述或安装说明。
- [ ] 运行 `HOME="$(mktemp -d)" npm test -- test/plugin-i18n.test.ts test/codex-plugin.test.ts`。

验收：中文插件安装路径下，agent-facing 指令为中文，MCP tool name 仍可正确调用。

### 阶段 7：文档、社区维护与回归

- [ ] README 增加 locale 使用说明和中文用户示例。
- [ ] CONTRIBUTING 增加新增语言流程。
- [ ] 增加 locale parity 检查，防止新增英文 key 后中文漏翻。
- [ ] 运行 `HOME="$(mktemp -d)" npm test`。
- [ ] 运行 `npm run build`。
- [ ] 手动启动 `AGENTMEMORY_LOCALE=zh-CN npm run dev`，检查 Viewer 主要页面。

验收：新增语言的贡献路径清晰，英文用户无行为回归。

## 风险与处理

- 风险：翻译 enum 或 XML tag 会破坏解析。
  - 处理：所有 schema token 保持英文，测试锁定。
- 风险：LLM 在中文 prompt 下仍输出英文。
  - 处理：统一 language instruction，并在验证测试里至少检查 prompt 约束；必要时增加 self-correct retry。
- 风险：Viewer 巨型 HTML 迁移容易漏 key。
  - 处理：先从参考分支迁移，再做全量 `rg` 查残留英文；locale parity test 卡住缺漏。
- 风险：插件 manifest 不支持动态 locale。
  - 处理：首版通过 CLI connect 或独立目录选择中文 skills，不依赖运行时 manifest 条件。
- 风险：旧数据仍是英文。
  - 处理：不迁移旧数据；文档明确 locale 只影响新生成内容和 UI 文案。

## 开放问题

需要用户或维护者最终确认：

1. 中文术语是否固定为：图谱、记忆、时间线、会话、经验、任务、结晶、审计、动态、画像、回放。
2. `AGENTMEMORY_LOCALE=zh-CN` 是否作为唯一公开配置名；`VIEWER_LANGUAGE` 是否只做兼容。
3. CLI 是否首版完整中文化，还是先覆盖 `status / doctor / init / demo / connect` 主路径。
4. 中文 plugin skills 是首版必须随包发布，还是先由 `agentmemory connect ...` 按 locale 生成。

## 推荐首版验收标准

- 默认不设置 `AGENTMEMORY_LOCALE` 时，现有英文行为和测试保持不变。
- 设置 `AGENTMEMORY_LOCALE=zh-CN` 后：
  - Viewer 12 个页签和主要页面中文显示。
  - 新生成的观察压缩、会话总结、记忆整合、图谱抽取、结晶、经验、画像、回放 label 默认中文。
  - MCP tool list 的描述和参数说明中文显示，tool name/schema key 不变。
  - 插件 skills 至少 Codex/Claude 主插件提供中文版本。
  - `npm test` 和 `npm run build` 通过。
