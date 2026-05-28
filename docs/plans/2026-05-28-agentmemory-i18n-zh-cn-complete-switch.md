# agentmemory zh-CN Complete Locale Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `AGENTMEMORY_LOCALE=en|zh-CN` the single switch for all user-facing English/Chinese output across agentmemory, while preserving API contracts and machine-readable identifiers.

**Architecture:** Keep `getLocale()` as the only runtime locale source, backed by `AGENTMEMORY_LOCALE` with `VIEWER_LANGUAGE` as deprecated fallback. Move every human-facing string in CLI, REST wrappers, default generated text, plugin install selection, and localized skills into locale resources or localized assets. Add tests and source scans that prevent new English user-facing literals from bypassing the i18n layer.

**Tech Stack:** TypeScript ESM, Vitest, JSON locale catalogs, static plugin assets, iii-sdk REST/MCP registration, Node.js filesystem APIs.

---

## Review Baseline

This plan closes the gaps found in the complete-switch review:

- `src/cli/connect/index.ts` and `src/cli/onboarding.ts` still print English prompts under `AGENTMEMORY_LOCALE=zh-CN`.
- `src/cli.ts` still has English user-facing paths for engine bootstrap, `upgrade`, `stop`, `remove`, and `import-jsonl`.
- `src/triggers/api.ts` still has many literal REST wrapper `body.error` strings.
- `src/functions/slots.ts` seeds default slot descriptions in English.
- `plugin/skills.zh-CN/recap/SKILL.md` still asks for an English final sentence.
- Codex/Claude plugin manifests still point to English skills, so env alone does not switch plugin skill language.

Non-goals:

- Do not translate REST paths, JSON field names, MCP tool names, schema property names, enum values, XML/JSON tags, code identifiers, commands, package names, file paths, URLs, or existing stored user content.
- Do not translate logger-only diagnostics unless the same text is returned through REST or printed by CLI.
- Do not bulk-translate persisted memory data.

## Acceptance Criteria

- `AGENTMEMORY_LOCALE=zh-CN` switches Viewer, MCP descriptions, REST wrapper errors, CLI commands, onboarding/connect flows, OpenCode commands, generated prompt/headings, seeded slot descriptions, and localized plugin skills where the target supports localized assets.
- `AGENTMEMORY_LOCALE=en` preserves existing English behavior.
- `VIEWER_LANGUAGE=zh-CN` still works only as fallback when `AGENTMEMORY_LOCALE` is unset.
- Codex/Claude connect has a locale-aware path for zh-CN skills instead of relying only on static English marketplace manifests.
- API contracts remain stable: status codes, field names, REST paths, tool names, enum values, and command examples do not change.
- `rg 'body:\s*\{\s*error:\s*"' src/triggers/api.ts` returns zero matches for REST wrapper errors.
- `rg 'p\.(intro|outro|log\.(error|info|warn|success)|note)\(' src/cli.ts src/cli -g '*.ts'` has no direct English user-facing sentence literals except an explicit allowlist test.
- Focused i18n tests, `npm run build`, `HOME="$(mktemp -d)" npm test`, and `git diff --check` pass.

## File Map

- Create: `src/cli/i18n.ts` - shared CLI translation helpers.
- Create: `src/cli/connect/plugin-locale.ts` - locale-aware Codex/Claude plugin staging manifest support.
- Create: `test/i18n-completeness.test.ts` - source-level i18n guard tests.
- Create: `test/slots-i18n.test.ts` - default slot description locale tests.
- Modify: `src/cli.ts` - localize remaining top-level CLI flows.
- Modify: `src/cli/onboarding.ts` - localize first-run setup.
- Modify: `src/cli/connect/index.ts` - localize connect dispatcher and pass locale consistently.
- Modify: `src/cli/connect/util.ts` and selected adapters - localize connect logs/manual notes.
- Modify: `src/triggers/api.ts` - localize all REST wrapper errors.
- Modify: `src/functions/slots.ts` - locale-aware default slot descriptions.
- Modify: `src/i18n/locales/en.json` and `src/i18n/locales/zh-CN.json` - add complete message keys.
- Modify: `plugin/skills.zh-CN/**/SKILL.md` - remove leftover English natural-language instructions.
- Modify: `test/cli-i18n.test.ts`, `test/cli-connect.test.ts`, `test/cli-onboarding.test.ts`, `test/api-i18n.test.ts`, `test/plugin-i18n.test.ts`.

---

### Task 1: Shared CLI Translation Helper

**Files:**
- Create: `src/cli/i18n.ts`
- Modify: `src/cli.ts`
- Test: `test/cli-i18n.test.ts`

- [ ] **Step 1: Add `src/cli/i18n.ts`**

```ts
import { getLocale } from "../config.js";
import { t, type Locale } from "../i18n/index.js";

export type CliParams = Record<string, string | number | boolean>;

export function currentCliLocale(): Locale {
  return getLocale();
}

export function cliT(key: string, params: CliParams = {}): string {
  return t(currentCliLocale(), `cli.${key}`, params);
}

export function cliTFor(
  locale: Locale,
  key: string,
  params: CliParams = {},
): string {
  return t(locale, `cli.${key}`, params);
}
```

- [ ] **Step 2: Refactor `src/cli.ts`**

Replace the local helper functions with:

```ts
import { currentCliLocale, cliT, cliTFor } from "./cli/i18n.js";
```

Then replace display-only `const locale = getLocale();` in `runStatus`, `runDoctor`, `runInit`, and `runDemo` with:

```ts
const locale = currentCliLocale();
```

- [ ] **Step 3: Add helper test**

Add to `test/cli-i18n.test.ts`:

```ts
it("shared CLI helper reads AGENTMEMORY_LOCALE", async () => {
  const previous = process.env["AGENTMEMORY_LOCALE"];
  process.env["AGENTMEMORY_LOCALE"] = "zh-CN";
  try {
    const mod = await import("../src/cli/i18n.js?t=" + Date.now());
    expect(mod.cliT("status.health")).toBe("健康");
  } finally {
    if (previous === undefined) delete process.env["AGENTMEMORY_LOCALE"];
    else process.env["AGENTMEMORY_LOCALE"] = previous;
  }
});
```

- [ ] **Step 4: Verify**

Run:

```bash
HOME="$(mktemp -d)" npx vitest run test/cli-i18n.test.ts
```

Expected: pass.

---

### Task 2: Complete Top-level CLI Locale Coverage

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/zh-CN.json`
- Test: `test/cli-i18n.test.ts`

- [ ] **Step 1: Add catalog key groups**

Add these groups under `cli` in both locale files:

```json
{
  "engine": {
    "attachedExisting": "Attached to existing iii-engine (pid {{pid}})",
    "curlMissing": "curl or sh not found. Cannot auto-install iii-engine.",
    "nonInteractiveInstall": "Non-interactive environment detected — auto-installing iii-engine.",
    "binaryMissing": "iii-engine binary not found locally.",
    "startChoice": "How would you like to start iii-engine?",
    "autoInstallDockerFallback": "Auto-install failed. Try Docker compose instead?",
    "skipCheck": "Skipping engine check (--no-engine)",
    "running": "iii-engine is running",
    "startFailed": "Could not start iii-engine.",
    "setupRequiredTitle": "Setup required",
    "crashed": "The iii-engine process crashed on startup.",
    "binary": "Binary: {{path}}",
    "stderrTitle": "engine stderr",
    "noStderr": "No stderr was captured. Re-run with --verbose for more detail.",
    "restNeverResponded": "The engine process started but the REST API never responded."
  },
  "upgrade": {
    "intro": "agentmemory upgrade",
    "workingDirectory": "Working directory: {{cwd}}",
    "aborted": "Upgrade aborted: {{label}} failed.",
    "rerunInstaller": "Re-run the iii-engine install script (curl | sh)?",
    "cancelled": "Cancelled.",
    "installerSkipped": "Skipped iii-engine installer.",
    "dockerMissing": "Docker not found. Skipping Docker image refresh.",
    "noteTitle": "agentmemory upgrade",
    "note": "Upgrade flow completed.\n\nRecommended next steps:\n  1) agentmemory status\n  2) npm/pnpm test\n  3) restart agentmemory process"
  },
  "stop": {
    "intro": "agentmemory stop",
    "noEngineOnPort": "No engine responding on port {{port}}.",
    "nothingToStop": "Nothing to stop.",
    "stopped": "Stopped. Memories persisted to disk; restart anytime with: npx @agentmemory/agentmemory",
    "stoppingEngine": "Stopping iii-engine (pid {{pid}})...",
    "stoppedPid": "Stopped pid {{pid}}",
    "failedPid": "Failed to stop pid {{pid}}",
    "processesSurvived": "One or more processes survived SIGKILL. Investigate with `ps`."
  },
  "remove": {
    "intro": "agentmemory remove",
    "alreadyGone": "Nothing to remove. agentmemory is already gone.",
    "planTitle": "destruction plan",
    "proceed": "Proceed with these deletions?",
    "irreversible": "This is irreversible. Continue?",
    "cancelled": "Cancelled. Nothing was deleted.",
    "done": "Done. agentmemory cleanly removed. The npm package itself: npm uninstall -g @agentmemory/agentmemory"
  },
  "importJsonl": {
    "badMaxFiles": "Ignoring {{flag}} {{value}}: expected a positive integer.",
    "probeFailed": "agentmemory livez probe failed on port {{port}}: {{detail}}. Start it with `npx @agentmemory/agentmemory` in another terminal, then re-run this command.",
    "importing": "Importing JSONL from {{path}}...",
    "viewReplay": "View at {{url}} -> Replay tab",
    "timedOut": "import timed out after 2 minutes"
  }
}
```

For `zh-CN`, translate only natural language. Preserve `iii-engine`, `SIGKILL`, `ps`, `curl | sh`, `npx @agentmemory/agentmemory`, `npm uninstall -g @agentmemory/agentmemory`, flags, and command examples.

- [ ] **Step 2: Replace CLI literals**

In `src/cli.ts`, convert examples like:

```ts
p.intro("agentmemory upgrade");
p.log.warn("No package manager found (pnpm/npm). Skipping JS dependency upgrade.");
p.outro("Nothing to stop.");
```

to:

```ts
const locale = currentCliLocale();
p.intro(cliTFor(locale, "upgrade.intro"));
p.log.warn(cliTFor(locale, "upgrade.noPackageManager"));
p.outro(cliTFor(locale, "stop.nothingToStop"));
```

For spinner labels, pass localized text into `runCommand()`:

```ts
runCommand(npmBin, ["install"], {
  label: cliTFor(locale, "upgrade.refreshDependenciesNpm"),
});
```

- [ ] **Step 3: Add focused assertions**

Add to `test/cli-i18n.test.ts`:

```ts
it("has zh-CN keys for non-key-path CLI commands", () => {
  const keys = [
    "cli.engine.startFailed",
    "cli.upgrade.note",
    "cli.stop.stopped",
    "cli.remove.done",
    "cli.importJsonl.timedOut",
  ];
  for (const key of keys) {
    expect(t("zh-CN", key)).toMatch(/[\u3400-\u9fff]/);
    expect(t("zh-CN", key)).not.toBe(t("en", key));
  }
});
```

- [ ] **Step 4: Verify**

Run:

```bash
HOME="$(mktemp -d)" npx vitest run test/cli-i18n.test.ts
```

Expected: pass.

---

### Task 3: Localize Onboarding and Connect

**Files:**
- Modify: `src/cli/onboarding.ts`
- Modify: `src/cli/connect/index.ts`
- Modify: `src/cli/connect/util.ts`
- Modify: `src/cli/connect/{claude-code,codex,opencode,json-mcp-adapter,hermes,openhuman,pi}.ts`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/zh-CN.json`
- Tests: `test/cli-onboarding.test.ts`, `test/cli-connect.test.ts`

- [ ] **Step 1: Add catalog keys**

Add `cli.onboarding.*` and `cli.connect.*` keys:

```json
{
  "onboarding": {
    "title": "first-run setup",
    "welcome": "Welcome to agentmemory.\n\nPersistent memory for your AI coding agents. We'll pick which agents to wire up and which provider (if any) handles compression and consolidation. Either step can be changed later in ~/.agentmemory/.env.",
    "agentsQuestion": "Which agents will use agentmemory? (space to toggle, enter to confirm)",
    "cancelled": "Setup cancelled. Re-run any time with: agentmemory --reset",
    "howThisWorks": "All selected agents share the same memory at :3111.\nA memory saved by Claude Code is visible to Codex + Cursor instantly.",
    "providerQuestion": "Which LLM provider should agentmemory use for compress/consolidate?",
    "readyTitle": "ready",
    "savedPrefs": "Saved preferences to {{path}}",
    "wroteEnv": "Wrote {{path}} (edit to add your API key)",
    "envWriteFailed": "Could not write ~/.agentmemory/.env — run `agentmemory init` after this completes.",
    "uncommentProvider": "Uncomment {{envKey}}= in that file to enable {{provider}}.",
    "noProvider": "No provider chosen — agentmemory will run in BM25-only mode.",
    "wireNowTitle": "next step",
    "wireNow": "Run `agentmemory connect <agent>` for each selected agent now? [Y/n]",
    "wireLaterTitle": "later",
    "wireLater": "Wire later with:",
    "wireSummaryTitle": "wire summary",
    "wired": "Wired: {{agents}}.",
    "skippedFailed": "Skipped/failed: {{items}}.",
    "noneWired": "No agents were wired."
  },
  "connect": {
    "intro": "agentmemory connect",
    "windowsUnsupported": "Windows: automated `connect` is not supported yet. See https://github.com/rohitg00/agentmemory#other-agents for manual install steps.",
    "windowsOutro": "Windows: manual install required — see docs",
    "noneDetected": "No supported agents detected on this machine.",
    "supported": "Supported: {{agents}}",
    "pickAgents": "Wire agentmemory into which agents?",
    "cancelled": "Cancelled.",
    "unknownAgent": "Unknown agent: {{agent}}",
    "summaryTitle": "summary",
    "installedLine": "{{agent}} -> {{path}}",
    "alreadyWiredLine": "{{agent}} (already wired)",
    "manualLine": "{{agent}} (manual install required: {{reason}})",
    "skippedLine": "{{agent}} (skipped: {{reason}})",
    "manualCount": "{{count}} agent(s) require manual install — see docs links above.",
    "restartOutro": "Restart any wired agent (or open a new session) to pick up agentmemory.",
    "notDetected": "{{agent}}: not detected on this machine (skipping).{{docs}}",
    "wiring": "Wiring {{agent}}...",
    "installed": "{{agent}} -> wired into {{path}}",
    "alreadyWired": "{{agent}} already wired in {{path}} (use --force to re-install)",
    "backup": "Backup: {{path}}"
  }
}
```

- [ ] **Step 2: Pass locale into onboarding connect calls**

In `src/cli/onboarding.ts`, change:

```ts
result = await runAdapter(adapter, { dryRun: false, force: false });
```

to:

```ts
result = await runAdapter(adapter, {
  dryRun: false,
  force: false,
  locale: currentCliLocale(),
});
```

- [ ] **Step 3: Localize connect dispatcher**

In `src/cli/connect/index.ts`, add:

```ts
import { currentCliLocale, cliTFor } from "../i18n.js";
```

Then use:

```ts
const locale = currentCliLocale();
p.intro(cliTFor(locale, "connect.intro"));
p.log.error(cliTFor(locale, "connect.noneDetected"));
p.outro(cliTFor(locale, "connect.supported", { agents: knownAgents().join(", ") }));
```

- [ ] **Step 4: Localize connect util helpers**

Change signatures in `src/cli/connect/util.ts` to accept `locale`:

```ts
export function logInstalled(label: string, target: string, locale: Locale = currentCliLocale()): void {
  p.log.success(cliTFor(locale, "connect.installed", { agent: label, path: target }));
}
```

Do the same for `logAlreadyWired()` and `logBackup()`. Update callers to pass `opts.locale`.

- [ ] **Step 5: Add tests**

Add to `test/cli-connect.test.ts`:

```ts
it("connect catalog preserves supported agent names while localizing labels", () => {
  expect(t("zh-CN", "cli.connect.noneDetected")).toMatch(/[\u3400-\u9fff]/);
  expect(t("zh-CN", "cli.connect.supported", { agents: "codex, opencode" })).toContain("codex, opencode");
});
```

Add to `test/cli-onboarding.test.ts`:

```ts
it("onboarding zh-CN text preserves command examples", () => {
  const text = t("zh-CN", "cli.onboarding.cancelled");
  expect(text).toMatch(/[\u3400-\u9fff]/);
  expect(text).toContain("agentmemory --reset");
});
```

- [ ] **Step 6: Verify**

Run:

```bash
HOME="$(mktemp -d)" npx vitest run test/cli-connect.test.ts test/cli-onboarding.test.ts
```

Expected: pass.

---

### Task 4: Locale-aware Codex/Claude Plugin Skill Selection

**Files:**
- Create: `src/cli/connect/plugin-locale.ts`
- Modify: `src/cli/connect/codex.ts`
- Modify: `src/cli/connect/claude-code.ts`
- Modify: `plugin/.codex-plugin/plugin.json`
- Modify: `plugin/.claude-plugin/plugin.json`
- Modify: `test/plugin-i18n.test.ts`

- [ ] **Step 1: Add plugin staging helper**

Create `src/cli/connect/plugin-locale.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Locale } from "../../i18n/locale.js";

export function localizedPluginRoot(locale: Locale): string | null {
  if (locale !== "zh-CN") return null;
  return join(homedir(), ".agentmemory", "plugins", "agentmemory.zh-CN");
}

export function writeLocalizedCodexManifest(pluginRoot: string, locale: Locale): string {
  const targetRoot = localizedPluginRoot(locale);
  if (!targetRoot) return join(pluginRoot, ".codex-plugin", "plugin.json");
  mkdirSync(join(targetRoot, ".codex-plugin"), { recursive: true });
  const source = join(pluginRoot, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(readFileSync(source, "utf-8"));
  manifest.skills = "./skills.zh-CN/";
  const target = join(targetRoot, ".codex-plugin", "plugin.json");
  writeFileSync(target, JSON.stringify(manifest, null, 2) + "\n");
  return target;
}

export function writeLocalizedClaudeManifest(pluginRoot: string, locale: Locale): string {
  const targetRoot = localizedPluginRoot(locale);
  if (!targetRoot) return join(pluginRoot, ".claude-plugin", "plugin.json");
  mkdirSync(join(targetRoot, ".claude-plugin"), { recursive: true });
  const source = join(pluginRoot, ".claude-plugin", "plugin.json");
  const manifest = JSON.parse(readFileSync(source, "utf-8"));
  manifest.skills = ["./skills.zh-CN/"];
  const target = join(targetRoot, ".claude-plugin", "plugin.json");
  writeFileSync(target, JSON.stringify(manifest, null, 2) + "\n");
  return target;
}
```

- [ ] **Step 2: Use helper in Codex/Claude connect**

In the Codex and Claude adapters, when `opts.locale === "zh-CN"`, call the helper and print the generated manifest path. Do not change static marketplace manifests to dynamic paths; static files remain English defaults.

- [ ] **Step 3: Test manifest staging**

Add to `test/plugin-i18n.test.ts`:

```ts
it("can generate zh-CN Codex and Claude manifests without changing static defaults", async () => {
  const { writeLocalizedCodexManifest, writeLocalizedClaudeManifest } =
    await import("../src/cli/connect/plugin-locale.js");
  const codexPath = writeLocalizedCodexManifest(pluginRoot, "zh-CN");
  const claudePath = writeLocalizedClaudeManifest(pluginRoot, "zh-CN");
  expect(JSON.parse(readFileSync(codexPath, "utf-8")).skills).toBe("./skills.zh-CN/");
  expect(JSON.parse(readFileSync(claudePath, "utf-8")).skills).toEqual(["./skills.zh-CN/"]);
});
```

- [ ] **Step 4: Verify**

Run:

```bash
HOME="$(mktemp -d)" npx vitest run test/plugin-i18n.test.ts test/cli-connect.test.ts
```

Expected: pass.

---

### Task 5: Full REST Wrapper Error Localization

**Files:**
- Modify: `src/triggers/api.ts`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `test/api-i18n.test.ts`
- Modify: `test/i18n-completeness.test.ts`

- [ ] **Step 1: Add generic API error helpers**

Keep the existing `apiT()` and `apiError()` helpers in `src/triggers/api.ts`, then add:

```ts
function apiFieldRequired(field: string): { error: string } {
  return apiError("fieldRequired", { field });
}

function apiFieldNonEmptyString(field: string): { error: string } {
  return apiError("fieldNonEmptyString", { field });
}

function apiFieldsRequired(fields: string): { error: string } {
  return apiError("fieldsRequired", { fields });
}
```

- [ ] **Step 2: Add catalog keys**

Add to `api.errors` in both locales:

```json
{
  "fieldRequired": "{{field}} is required",
  "fieldNonEmptyString": "{{field}} must be a non-empty string",
  "fieldsRequired": "{{fields}} are required",
  "fieldString": "{{field}} must be a string",
  "fieldStringArray": "{{field}} must be an array of strings",
  "fieldBoolean": "{{field}} must be a boolean",
  "invalidNumericParameter": "invalid numeric parameter: {{field}}",
  "notEnabled": "{{feature}} not enabled",
  "notFound": "{{item}} not found",
  "invalidDate": "Invalid '{{field}}' date format",
  "providerRequired": "{{feature}} requires a provider"
}
```

For zh-CN, preserve `field`, `feature`, and API identifiers in English inside the interpolated value.

- [ ] **Step 3: Replace all literal REST wrapper errors**

Run:

```bash
rg -n 'body:\s*\{\s*error:\s*"' src/triggers/api.ts
```

Replace each match. Examples:

```ts
return { status_code: 400, body: { error: "project must be a string" } };
```

becomes:

```ts
return { status_code: 400, body: apiError("fieldString", { field: "project" }) };
```

```ts
return { status_code: 404, body: { error: "Claude bridge not enabled" } };
```

becomes:

```ts
return { status_code: 404, body: apiError("notEnabled", { feature: "Claude bridge" }) };
```

- [ ] **Step 4: Add source guard**

Create or extend `test/i18n-completeness.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("i18n source completeness", () => {
  it("does not leave REST wrapper errors as string literals", () => {
    const source = readFileSync("src/triggers/api.ts", "utf-8");
    expect(source).not.toMatch(/body:\s*\{\s*error:\s*"/);
  });
});
```

- [ ] **Step 5: Add behavior tests**

Add to `test/api-i18n.test.ts`:

```ts
it("localizes generic REST field errors", async () => {
  let handler: ((req: { body?: Record<string, unknown> }) => Promise<{ status_code: number; body: unknown }>) | undefined;
  const sdk = {
    registerFunction: vi.fn((id: string, cb: typeof handler) => {
      if (id === "api::compress-file") handler = cb;
    }),
    registerTrigger: vi.fn(),
    trigger: vi.fn(),
  } as unknown as import("iii-sdk").ISdk;
  registerApiTriggers(sdk, {} as never);
  const response = await handler!({ body: {} });
  expect(response.status_code).toBe(400);
  expect(response.body).toEqual({ error: "filePath 必须是非空字符串" });
});
```

- [ ] **Step 6: Verify**

Run:

```bash
HOME="$(mktemp -d)" npx vitest run test/api-i18n.test.ts test/i18n-completeness.test.ts
```

Expected: pass and the `rg` command returns no matches.

---

### Task 6: Localize Default Generated Slot Text and zh-CN Skills

**Files:**
- Modify: `src/functions/slots.ts`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `plugin/skills.zh-CN/recap/SKILL.md`
- Test: `test/slots-i18n.test.ts`, `test/plugin-i18n.test.ts`

- [ ] **Step 1: Add slot catalog keys**

Add under `slots.defaults`:

```json
{
  "persona": "How the agent should see itself: role, tone, behavioural guidelines.",
  "user_preferences": "Coding style, tool preferences, naming conventions, and other habits the user wants preserved across sessions.",
  "tool_guidelines": "Rules the agent should follow when picking or sequencing tools (e.g. prefer X over Y, never run Z without confirmation).",
  "project_context": "Architecture decisions, codebase conventions, build/test commands, and cross-cutting constraints for the current project.",
  "guidance": "Active advice for the next session: what to focus on, what to avoid, open risks.",
  "pending_items": "Unfinished work, explicit follow-ups, and promises made but not yet delivered.",
  "session_patterns": "Recurring behaviours and common struggles observed across recent sessions.",
  "self_notes": "Free-form notes the agent keeps for itself: hypotheses, dead ends, things to revisit."
}
```

- [ ] **Step 2: Refactor default slots**

In `src/functions/slots.ts`, import locale helpers:

```ts
import { getLocale } from "../config.js";
import { t, type Locale } from "../i18n/index.js";
```

Define immutable templates without descriptions:

```ts
const DEFAULT_SLOT_TEMPLATES = [
  { label: "persona", content: "", sizeLimit: 1000, pinned: true, readOnly: false, scope: "global" },
  { label: "user_preferences", content: "", sizeLimit: 2000, pinned: true, readOnly: false, scope: "global" }
] as const;
```

Then export:

```ts
export function defaultSlots(locale: Locale = getLocale()): ReadonlyArray<Omit<MemorySlot, "createdAt" | "updatedAt">> {
  return DEFAULT_SLOT_TEMPLATES.map((slot) => ({
    ...slot,
    description: t(locale, `slots.defaults.${slot.label}`),
  }));
}

export const DEFAULT_SLOTS = defaultSlots("en");
```

Use `defaultSlots(getLocale())` wherever slots are seeded.

- [ ] **Step 3: Fix zh-CN recap skill**

Change `plugin/skills.zh-CN/recap/SKILL.md` line:

```md
最后用一行总计结束："N sessions across M days, K observations."
```

to:

```md
最后用一行中文总计结束，保留数字原样，例如："共 N 个会话，覆盖 M 天，K 条观察。"
```

- [ ] **Step 4: Add tests**

Create `test/slots-i18n.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultSlots } from "../src/functions/slots.js";

describe("slot i18n", () => {
  it("localizes default slot descriptions in zh-CN without translating labels", () => {
    const slots = defaultSlots("zh-CN");
    expect(slots.map((s) => s.label)).toContain("persona");
    expect(slots.find((s) => s.label === "persona")?.description).toMatch(/[\u3400-\u9fff]/);
  });
});
```

Extend `test/plugin-i18n.test.ts`:

```ts
it("zh-CN recap skill asks for a Chinese final total", () => {
  const content = readFileSync(join(pluginRoot, "skills.zh-CN", "recap", "SKILL.md"), "utf-8");
  expect(content).toContain("共 N 个会话");
  expect(content).not.toContain("N sessions across M days");
});
```

- [ ] **Step 5: Verify**

Run:

```bash
HOME="$(mktemp -d)" npx vitest run test/slots-i18n.test.ts test/plugin-i18n.test.ts
```

Expected: pass.

---

### Task 7: Enforce Catalog and Source Completeness

**Files:**
- Modify: `test/i18n-completeness.test.ts`

- [ ] **Step 1: Add catalog parity test**

```ts
import en from "../src/i18n/locales/en.json" with { type: "json" };
import zh from "../src/i18n/locales/zh-CN.json" with { type: "json" };

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flatten(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

it("zh-CN has every production key from English", () => {
  const enKeys = flatten(en).filter((key) => !key.startsWith("test."));
  const zhKeys = new Set(flatten(zh));
  expect(enKeys.filter((key) => !zhKeys.has(key))).toEqual([]);
});
```

- [ ] **Step 2: Add CLI literal guard**

```ts
it("does not add direct English prompt/log literals in CLI entrypoints", () => {
  const files = ["src/cli.ts", "src/cli/onboarding.ts", "src/cli/connect/index.ts"];
  const forbidden = /p\.(intro|outro|note|log\.(error|info|warn|success))\(\s*["'`][A-Z][A-Za-z ,.!?:;()/-]{8,}/;
  for (const file of files) {
    const source = readFileSync(file, "utf-8");
    expect(source, file).not.toMatch(forbidden);
  }
});
```

If this catches legitimate non-human text, add a local allowlist comment in the test, not in production code.

- [ ] **Step 3: Verify**

Run:

```bash
HOME="$(mktemp -d)" npx vitest run test/i18n-completeness.test.ts
```

Expected: pass.

---

### Task 8: End-to-end Locale Switch Smoke Tests

**Files:**
- Modify: `test/cli-i18n.test.ts`
- Modify: `test/mcp-i18n.test.ts`
- Modify: `test/api-i18n.test.ts`

- [ ] **Step 1: Add CLI process smoke tests after build**

Use `spawnSync` against `dist/cli.mjs`:

```ts
import { spawnSync } from "node:child_process";

it("prints zh-CN help when AGENTMEMORY_LOCALE=zh-CN", () => {
  const result = spawnSync(process.execPath, ["dist/cli.mjs", "--help"], {
    env: { ...process.env, AGENTMEMORY_LOCALE: "zh-CN" },
    encoding: "utf-8",
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("用法");
  expect(result.stdout).toContain("AGENTMEMORY_LOCALE");
});
```

- [ ] **Step 2: Add English smoke test**

```ts
it("prints English help when AGENTMEMORY_LOCALE=en", () => {
  const result = spawnSync(process.execPath, ["dist/cli.mjs", "--help"], {
    env: { ...process.env, AGENTMEMORY_LOCALE: "en" },
    encoding: "utf-8",
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Usage");
  expect(result.stdout).not.toContain("用法");
});
```

- [ ] **Step 3: Verify build and smoke tests**

Run:

```bash
npm run build
HOME="$(mktemp -d)" npx vitest run test/cli-i18n.test.ts test/mcp-i18n.test.ts test/api-i18n.test.ts
```

Expected: pass.

---

### Task 9: Final Verification and Reporting

**Files:**
- No implementation files unless fixing verification failures.

- [ ] **Step 1: Run source scans**

Run:

```bash
rg -n 'body:\s*\{\s*error:\s*"' src/triggers/api.ts
rg -n 'p\.(intro|outro|log\.(error|info|warn|success)|note)\(\s*["'"'"'`][A-Z][A-Za-z ,.!?:;()/-]{8,}' src/cli.ts src/cli -g '*.ts'
```

Expected: no disallowed matches.

- [ ] **Step 2: Run focused tests**

Run:

```bash
HOME="$(mktemp -d)" npx vitest run \
  test/i18n.test.ts \
  test/i18n-completeness.test.ts \
  test/viewer-i18n.test.ts \
  test/mcp-i18n.test.ts \
  test/cli-i18n.test.ts \
  test/cli-connect.test.ts \
  test/cli-onboarding.test.ts \
  test/api-i18n.test.ts \
  test/plugin-i18n.test.ts \
  test/slots-i18n.test.ts \
  test/context-i18n.test.ts \
  test/prompts-i18n.test.ts \
  test/replay-i18n.test.ts
```

Expected: pass.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run build
HOME="$(mktemp -d)" npm test
git diff --check
```

Expected: all pass. If full `npm test` times out in unrelated files, rerun failing files once. If they pass in isolation, record the flake with exact failing tests and still fix any repeated failure.

- [ ] **Step 4: Final review checklist**

Before reporting complete, answer each item with evidence:

- `AGENTMEMORY_LOCALE=zh-CN` changes CLI `--help`, onboarding, connect, status, doctor, init, demo, stop, remove, upgrade, and import output.
- `AGENTMEMORY_LOCALE=zh-CN` changes REST wrapper user-facing errors while preserving response shape.
- `AGENTMEMORY_LOCALE=zh-CN` changes MCP descriptions and keeps tool/schema names stable.
- `AGENTMEMORY_LOCALE=zh-CN` changes Viewer labels and keeps routing/tab identifiers stable.
- `AGENTMEMORY_LOCALE=zh-CN` changes generated natural-language prompt instructions and default slot descriptions.
- `AGENTMEMORY_LOCALE=en` still returns English for all above.
- Codex/Claude/OpenCode plugin language behavior is documented and tested.

## Execution Notes

- Use temporary `HOME` for tests to avoid local `~/.agentmemory/.env` affecting provider/locale behavior.
- Keep commits narrow if committing: one commit per task is preferred.
- Preserve existing dirty worktree changes; do not revert unrelated files.
- If subagents are used, split by disjoint write sets:
  - CLI/onboarding/connect text.
  - REST error catalog.
  - plugin/skills/default slots.
  - completeness tests/final verification.
