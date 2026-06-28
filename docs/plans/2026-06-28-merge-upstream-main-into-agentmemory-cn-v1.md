# Merge Upstream Main Into agentmemory-cn v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge official `upstream/main` into the Chinese fork branch `v1.0.0`, preserve the fork's zh-CN runtime adaptation and local safety guardrails, then push future-ready work back to `RayShark/agentmemory-cn`.

**Architecture:** Use a fresh isolated integration worktree from `v1.0.0`; do not reuse the dirty old `agentmemory-upstream-v0.9.27-merge` worktree. Merge `upstream/main` in staged lanes, with the coordinator owning git state and shared metadata while gpt-5.5 xhigh subagents review or patch disjoint file groups. Finish with a dedicated zh-CN completeness pass and version/count synchronization pass.

**Tech Stack:** Git worktrees, TypeScript ESM, iii-sdk, tsdown, Vitest, Markdown, plugin manifests, Viewer HTML/locales, MCP and REST registry files.

---

## Current Evidence

- Current local branch: `v1.0.0`
- Current local HEAD: `17a2c82` (`fix: expand zh-CN localization for agentmemory`)
- Current fork remote: `origin -> https://github.com/RayShark/agentmemory-cn.git`
- Current upstream remote: `upstream -> https://github.com/rohitg00/agentmemory.git`
- Official upstream tip on 2026-06-28: `f6f9e3c` (`fix(website): portal mobile nav sheet to body and close breakpoint gap (#670)`)
- Merge base: `6939d4a`
- Local-only commits since merge base:
  - `17a2c82` zh-CN localization expansion
  - `3deef5b` high-cost LLM guardrails
  - `a5ebb96` bounded export and slots gating
  - `f928b1c` Codex hook wrapper hardening
  - `d72a8e1` LAN viewer and embedding mirror config
  - `c2b467f` embedding disable support
  - `5f6b5c7` hook payload and i18n hardening
  - `2a59a65` zh-CN locale switch
  - `1062af1` Viewer timeline sort toggle
- Official upstream-only commits include v0.9.23 through v0.9.27 era work plus post-release changes:
  - Copilot/Warp/Cline/Continue/Zed/Droid/OpenCode connect adapters
  - graph/query and index persistence fixes
  - SDK recursion guard and iii pinning updates
  - sessions summary API changes
  - website/docs/readme refreshes
  - new plugin skills and translated README set

## Non-Negotiable Preservation Rules

- Keep zh-CN runtime entry points:
  - `src/i18n/locales/zh-CN.json`
  - `src/viewer/locales/zh-CN.json`
  - `src/cli/i18n.ts`
  - `src/viewer/locales.ts`
  - `plugin/skills.zh-CN/*`
  - `plugin/opencode/commands.zh-CN/*`
- Keep local high-cost LLM guardrails:
  - default-off hot paths: `AGENTMEMORY_AUTO_COMPRESS=false`, `AGENTMEMORY_INJECT_CONTEXT=false`, `GRAPH_EXTRACTION_ENABLED=false`, `CONSOLIDATION_ENABLED=false`, `AGENTMEMORY_REFLECT=false`
  - `AGENTMEMORY_LLM_CONCURRENCY=1`
  - `OPENAI_REASONING_EFFORT` validation
  - `OPENAI_TIMEOUT_MS > AGENTMEMORY_LLM_TIMEOUT_MS > 60000`
  - malformed timeout values fall back to `60000`
- Keep embedding disable semantics:
  - `EMBEDDING_PROVIDER=none|off|disabled|false` hard-disables embeddings even when API keys exist
  - `OPENAI_API_KEY_FOR_LLM=false` only affects LLM provider auto-detection
- Keep hook/runtime hardening:
  - wrapper-based plugin script launch where present
  - env loading helpers
  - payload sanitization
  - SDK-child recursion guard
  - project basename behavior where compatible with local i18n/hardening
- Keep fork identity:
  - local working branch remains `v1.0.0` or an integration branch that fast-forwards into it
  - future pushes should target `origin` (`RayShark/agentmemory-cn`)
  - user-facing fork docs should clearly say this project helps Chinese vibe-coding users

## Parallel Subagent Design

- Spawn at most 4 active subagents at once.
- Spawn with `model=gpt-5.5`, `reasoning_effort=xhigh`, `service_tier=priority`.
- Do not give two implementation workers overlapping write scopes.
- Use subagents primarily for lane-specific conflict review, targeted localization patches, and verification review.
- Close completed subagents immediately after reading their output.
- If a subagent produces no useful output within 10 minutes or is visibly idle while blocking concurrency, close it and continue locally.

Recommended lanes:

| Lane | Owner | Write scope |
| --- | --- | --- |
| Runtime policy | worker | `.env.example`, `src/config.ts`, `src/providers/*`, `src/cli/doctor-diagnostics.ts`, cost/embedding/timeout tests |
| CLI/connect/plugin | worker | `src/cli.ts`, `src/cli/connect/*`, `src/cli/onboarding.ts`, plugin manifests, connect tests |
| Hooks/MCP/API | worker | `src/hooks/*`, `plugin/scripts/*`, `plugin/hooks/*`, `src/mcp/*`, `src/triggers/api.ts`, hook/MCP/API tests |
| Viewer/i18n/docs | worker | `src/viewer/*`, `src/i18n/*`, zh-CN plugin assets, README/OpenCode docs, i18n/viewer tests |
| Metadata coordinator | main agent | `package.json`, `src/version.ts`, `src/types.ts`, `src/functions/export-import.ts`, count strings, final commits |

## Task 1: Freeze State And Write Plan

**Files:**
- Create: `docs/plans/2026-06-28-merge-upstream-main-into-agentmemory-cn-v1.md`

- [x] Record current upstream and local state.

Run:

```bash
git fetch --all --tags --prune
git rev-parse --short HEAD
git rev-parse --short origin/v1.0.0
git rev-parse --short upstream/main
git describe --tags --long upstream/main
git merge-base HEAD upstream/main
```

Expected:
- local `HEAD` and `origin/v1.0.0` are `17a2c82`
- `upstream/main` is `f6f9e3c`
- upstream describes as `v0.9.27-13-gf6f9e3c`
- merge base is `6939d4a86365...`

- [x] Preserve the old untracked 2026-06-24 plan instead of overwriting it.

Expected:
- `docs/plans/2026-06-24-merge-origin-main-into-agentmemory-i18n-zh-cn.md` remains untouched.

## Task 2: Create A Fresh Integration Worktree

**Files:**
- None

- [ ] Do not reuse the dirty old integration worktree.

Run:

```bash
git -C /nvme/xiazhourui/my-workspaces/agentmemory-upstream-v0.9.27-merge status --short
```

Expected:
- output shows many modified files, so the worktree is not a valid clean base.

- [ ] Create a new worktree from `v1.0.0`.

Run:

```bash
git worktree add /home/xiazhourui/.config/superpowers/worktrees/agentmemory/integrate-upstream-main-agentmemory-cn-v1 -b integrate/upstream-main-agentmemory-cn-v1 v1.0.0
```

Expected:
- new worktree exists at `/home/xiazhourui/.config/superpowers/worktrees/agentmemory/integrate-upstream-main-agentmemory-cn-v1`
- branch is `integrate/upstream-main-agentmemory-cn-v1`
- baseline HEAD is `17a2c82`

- [ ] Install dependencies only if `node_modules` is absent.

Run:

```bash
cd /home/xiazhourui/.config/superpowers/worktrees/agentmemory/integrate-upstream-main-agentmemory-cn-v1
test -d node_modules || npm install
```

Expected:
- dependencies are available

- [ ] Run baseline focused verification before merging.

Run:

```bash
npm test -- test/i18n.test.ts test/i18n-completeness.test.ts test/viewer-i18n.test.ts test/plugin-i18n.test.ts test/export-import.test.ts
```

Expected:
- these focused tests pass before any upstream merge

## Task 3: Merge Official Upstream Main

**Files:**
- Potential conflicts across `src/`, `plugin/`, `test/`, `README.md`, `package.json`, `website/`, `READMEs/`, `docs/`, and config files.

- [ ] Start the merge without committing.

Run:

```bash
cd /home/xiazhourui/.config/superpowers/worktrees/agentmemory/integrate-upstream-main-agentmemory-cn-v1
git merge --no-commit --no-ff upstream/main
```

Expected:
- merge stops on conflicts
- no conflict resolution is committed yet

- [ ] Capture the conflict list.

Run:

```bash
git diff --name-only --diff-filter=U
git status --short
```

Expected:
- conflicts are grouped into runtime policy, CLI/connect/plugin, hooks/MCP/API, Viewer/i18n/docs, and metadata.

- [ ] Spawn lane workers after conflict list is known.

Use gpt-5.5 xhigh workers:
- Runtime policy worker: cost, timeout, embedding, provider policy.
- CLI/connect/plugin worker: adapters, onboarding, manifests.
- Hooks/MCP/API worker: hooks, plugin scripts, MCP registry/server, REST handlers.
- Viewer/i18n/docs worker: Viewer, locale bundles, zh-CN assets, README/OpenCode docs.

Expected:
- each worker receives only its lane's file list and exact preservation rules.
- no two workers are assigned the same write files.

## Task 4: Resolve Runtime Policy Lane

**Files:**
- `.env.example`
- `deploy/README.md`
- `src/config.ts`
- `src/providers/openai.ts`
- `src/providers/embedding/openai.ts`
- `src/providers/embedding/local.ts`
- `src/cli/doctor-diagnostics.ts`
- `src/functions/compress.ts`
- `src/functions/compress-synthetic.ts`
- `src/functions/consolidation-pipeline.ts`
- `src/prompts/*`
- tests touching timeout, embedding, auto-compress, doctor diagnostics, frontier/profile/context behavior

- [ ] Apply upstream bug fixes without weakening local defaults.

Expected:
- expensive LLM paths remain opt-in or guarded
- upstream provider fixes and dependency bumps are retained
- timeout and reasoning-effort validation remain strict

- [ ] Run focused tests.

Run:

```bash
npm test -- test/fetch-timeout.test.ts test/embedding-provider.test.ts test/cli-doctor-fixes.test.ts test/auto-compress.test.ts test/context-lessons.test.ts test/frontier.test.ts test/profile.test.ts
```

Expected:
- tests pass or failures are explicitly classified as merge-induced and fixed before continuing

## Task 5: Resolve CLI, Connect, And Plugin Lane

**Files:**
- `src/cli.ts`
- `src/cli/connect/*`
- `src/cli/onboarding.ts`
- `src/cli/preferences.ts`
- `plugin/.claude-plugin/plugin.json`
- `plugin/.codex-plugin/plugin.json`
- `plugin/plugin.json`
- `plugin/.mcp.json`
- `plugin/.mcp.copilot.json`
- `plugin/opencode/*`
- related connect/plugin tests

- [ ] Keep upstream adapter additions.

Expected:
- Copilot CLI, Warp, Cline, Continue, Zed, Droid, and OpenCode additions are present where upstream added them.

- [ ] Keep local localized connect behavior.

Expected:
- `AGENTMEMORY_LOCALE=zh-CN` still selects Chinese OpenCode commands and localized plugin staging behavior.
- static Claude/Codex manifest behavior is documented, and the zh-CN reference skill set is present for the expanded upstream skills.

- [ ] Run focused tests.

Run:

```bash
npm test -- test/cli-connect.test.ts test/connect-new-agents.test.ts test/copilot-plugin.test.ts test/codex-plugin.test.ts test/cli-onboarding.test.ts test/plugin-i18n.test.ts
```

Expected:
- connect/plugin tests pass after metadata strings are synchronized.

## Task 6: Resolve Hooks, MCP, And API Lane

**Files:**
- `src/hooks/*`
- `plugin/scripts/*`
- `plugin/hooks/*`
- `src/mcp/server.ts`
- `src/mcp/tools-registry.ts`
- `src/mcp/standalone.ts`
- `src/mcp/transport.ts`
- `src/triggers/api.ts`
- `src/index.ts`
- hook/MCP/API tests

- [ ] Preserve wrapper and hook hardening.

Expected:
- hook scripts keep safe best-effort HTTP calls and `AbortSignal.timeout()`.
- plugin scripts keep wrapper/env/project behavior when local hardening exists.
- upstream payload shape changes are merged after safety behavior is preserved.

- [ ] Reconcile MCP tool and REST endpoint additions.

Expected:
- `src/mcp/tools-registry.ts`, `src/mcp/server.ts`, `src/triggers/api.ts`, `src/index.ts`, tests, README, and plugin descriptions stay consistent.

- [ ] Run focused tests.

Run:

```bash
npm test -- test/mcp-standalone.test.ts test/mcp-transport.test.ts test/tool-count-consistency.test.ts test/api-i18n.test.ts test/hooks-env.test.ts test/hooks-payload.test.ts test/codex-connect-hooks.test.ts test/claude-code-with-hooks.test.ts
```

Expected:
- count-sensitive tests and API/i18n tests pass after synchronization.

## Task 7: Resolve Viewer, i18n, And Docs Lane

**Files:**
- `src/i18n/*`
- `src/viewer/*`
- `src/replay/timeline.ts`
- `plugin/skills.zh-CN/*`
- `plugin/skills/*`
- `plugin/opencode/commands.zh-CN/*`
- `plugin/opencode/README.md`
- `README.md`
- `READMEs/*`
- Viewer/i18n tests

- [ ] Keep local zh-CN runtime locale system.

Expected:
- English and zh-CN message files have key parity.
- Viewer locale bundles are still copied during build.
- CSP-safe locale injection remains intact.

- [ ] Merge upstream Viewer fixes.

Expected:
- upstream graph/query, sessions, mobile/website-linked changes are retained when relevant to `src/viewer/*`.
- local timeline sort toggle and session-id rendering behavior remain.

- [ ] Fix known remaining zh-CN gaps.

Required fixes:
- Viewer hardcoded English chrome:
  - `<html lang="en">` should become locale-aware or neutralized by injected locale.
  - `agentmemory viewer`, `cwd`, `started`, `ended`, `model`, `tags` should be localized if visible in zh-CN mode.
- CLI splash tagline in `src/cli/splash.ts` should route through i18n or have a zh-CN branch.
- Codex hook status text in `plugin/hooks/hooks.codex.json` should not surprise zh-CN users when installed from the zh-CN path.
- `plugin/opencode/README.md` should include Chinese usage guidance, not only English.
- README opening section should keep the Chinese-vibe-coding explanation at the top.
- Done in this merge: zh-CN `SKILL.md` files are included for the seven new upstream reference skills, and generated zh-CN `REFERENCE.md` tables are emitted for data-backed reference skills under `plugin/skills.zh-CN/`.

- [ ] Run focused tests.

Run:

```bash
npm test -- test/i18n.test.ts test/i18n-completeness.test.ts test/cli-i18n.test.ts test/context-i18n.test.ts test/mcp-i18n.test.ts test/prompts-i18n.test.ts test/replay-i18n.test.ts test/slots-i18n.test.ts test/viewer-i18n.test.ts test/viewer-host.test.ts test/viewer-session-id.test.ts test/viewer-memories-sort.test.ts
```

Expected:
- zh-CN key parity and Viewer i18n tests pass.

## Task 8: Synchronize Version, Counts, And Fork Identity

**Files:**
- `package.json`
- `packages/mcp/package.json`
- `src/version.ts`
- `src/types.ts`
- `src/functions/export-import.ts`
- `test/export-import.test.ts`
- `plugin/.claude-plugin/plugin.json`
- `plugin/.codex-plugin/plugin.json`
- `plugin/opencode/plugin.json`
- `README.md`
- `AGENTS.md`
- `CHANGELOG.md` if upstream requires it

- [ ] Decide version string for the fork.

Default decision unless user overrides during implementation:
- Keep the branch named `v1.0.0`.
- Use package/export/plugin version `1.0.0` for the Chinese fork release after upstream merge.
- Preserve old supported export versions through upstream's latest supported set.

- [ ] Update version fields together.

Expected:
- `package.json` version is `1.0.0`
- `src/version.ts` exports `VERSION = "1.0.0"`
- `src/types.ts` `ExportData.version` union includes `1.0.0`
- `src/functions/export-import.ts` `supportedVersions` includes `1.0.0` and upstream-supported versions
- `test/export-import.test.ts` expects `1.0.0`
- plugin manifests use `1.0.0`

- [ ] Recount MCP tools, REST endpoints, hooks, skills, tests, and source stats after merge.

Run:

```bash
rg -n "MCP tools|REST endpoints|endpoints on port|hooks|skills|tests|source files|functions|KV scopes" README.md AGENTS.md plugin/.claude-plugin/plugin.json plugin/.codex-plugin/plugin.json
npm test -- test/mcp-standalone.test.ts test/tool-count-consistency.test.ts test/export-import.test.ts
```

Expected:
- count strings in README, AGENTS, plugin manifests, and tests agree with source.

- [ ] Repoint fork-facing repository metadata where appropriate.

Expected:
- fork package/plugin metadata and README fork instructions point to `https://github.com/RayShark/agentmemory-cn` when describing this fork.
- upstream attribution and comparison links remain intact where they are historical or benchmark references.

## Task 9: Commit Merge And Run Full Verification

**Files:**
- All merged files.

- [ ] Confirm there are no conflict markers.

Run:

```bash
rg -n "<<<<<<<|=======|>>>>>>>" .
git diff --check
git diff --cached --check
npm run skills:check
(cd website && npm run build)
```

Expected:
- no conflict markers
- no whitespace errors

- [ ] Run full project verification.

Run:

```bash
npm test
npm run build
```

Expected:
- full tests pass
- build passes

- [ ] Commit the integration result.

Run:

```bash
git status --short
git add -A
git commit -m "merge: integrate upstream main into agentmemory-cn v1"
```

Expected:
- integration branch has one reviewed merge/fix commit or a clean merge commit plus follow-up commits

## Task 10: Update `v1.0.0` And Push To Fork Remote

**Files:**
- None beyond committed merge result.

- [ ] Fast-forward local `v1.0.0` only after verification.

Run from the main worktree:

```bash
cd /nvme/xiazhourui/my-workspaces/agentmemory
git switch v1.0.0
git merge --ff-only integrate/upstream-main-agentmemory-cn-v1
```

Expected:
- `v1.0.0` points at the verified integration result.

- [ ] Push to the user's fork remote.

Run:

```bash
git push origin v1.0.0
```

Expected:
- push target is `https://github.com/RayShark/agentmemory-cn.git`
- no push goes to `upstream`

## Final Verification Checklist

- [ ] `git remote -v` shows `origin` as `RayShark/agentmemory-cn.git`.
- [ ] `git branch -vv` shows `v1.0.0` tracking `origin/v1.0.0`.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] zh-CN runtime files exist and tests pass.
- [ ] high-cost LLM guardrails remain present.
- [ ] export/import version metadata is synchronized.
- [ ] README starts by explaining this fork is for Chinese vibe-coding users.
- [ ] no stale subagents remain open.
