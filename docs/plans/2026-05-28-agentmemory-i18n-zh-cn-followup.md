# agentmemory zh-CN i18n Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining zh-CN coverage after the initial locale framework by removing user-visible English fallbacks from core CLI, MCP, REST, and plugin install flows.

**Architecture:** Keep `AGENTMEMORY_LOCALE` as the single locale decision point through `getLocale()`. Preserve API field names, REST paths, MCP tool names, schema property names, enum values, XML/JSON tags, commands, code identifiers, and stored user content in English. Localize only human-facing labels, descriptions, prompts, status text, and generated natural-language defaults.

**Tech Stack:** TypeScript ESM, Vitest, JSON locale catalogs, static plugin assets, iii-sdk MCP/REST registration.

---

## Current Remaining Scope

### Task 1: MCP Full zh-CN Description Matrix

**Files:**
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `test/mcp-i18n.test.ts`

- [ ] Add zh-CN message keys for every tool in `getAllTools("zh-CN")`, including each `inputSchema.properties.*.description`.
- [ ] Keep all tool names and schema property keys unchanged.
- [ ] Add a test that compares `getAllTools("en")` and `getAllTools("zh-CN")`: names and property keys must match exactly; every zh-CN description for non-empty descriptions must contain CJK text.
- [ ] Run `HOME="$(mktemp -d)" npx vitest run test/mcp-i18n.test.ts test/mcp-standalone.test.ts`.

### Task 2: CLI Key Path zh-CN Slice

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/zh-CN.json`
- Add or modify: `test/cli-i18n.test.ts`

- [ ] Localize `--help`, `status`, `init`, `demo`, and `doctor` top-level headings and high-frequency status/error text through `t(getLocale(), ...)`.
- [ ] Keep command examples, env var names, URLs, and code/package names unchanged.
- [ ] Add tests that run the CLI help/status/init/demo formatting paths under `AGENTMEMORY_LOCALE=zh-CN` without requiring a live engine where possible.
- [ ] Run focused CLI tests.

### Task 3: Plugin and OpenCode Locale-aware Install Selection

**Files:**
- Inspect and modify: `src/cli/connect*.ts` or `src/cli/connect/**`
- Modify: `plugin/opencode/README.md`
- Modify: `test/plugin-i18n.test.ts`

- [ ] Find the connect/install code path that copies or points to plugin skills/commands.
- [ ] When `getLocale() === "zh-CN"` and the target supports copied assets, select `plugin/skills.zh-CN` and `plugin/opencode/commands.zh-CN`; otherwise keep the default manifest pointed at English skills and document the limitation.
- [ ] Add tests proving zh-CN assets are selected or documented for the relevant install path.

### Task 4: REST High-frequency Error Labels

**Files:**
- Modify: `src/triggers/api.ts`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `test/api-i18n.test.ts`

- [ ] Localize high-frequency user-facing REST errors and labels exposed by config/status endpoints.
- [ ] Keep HTTP status codes, REST paths, JSON field names, and enum values unchanged.
- [ ] Add tests for at least one success response and one validation/error response under zh-CN.

### Task 5: Final Verification

- [ ] Run `npm run build`.
- [ ] Run focused tests for changed areas.
- [ ] Run `HOME="$(mktemp -d)" npm test`.
- [ ] Run `git diff --check`.
- [ ] Report remaining limitations, if any, as explicit product-scope follow-ups rather than framework blockers.
