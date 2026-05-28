import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { t } from "../src/i18n/index.js";

const cjk = /[\u3400-\u9fff]/;

describe("CLI i18n messages", () => {
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

  it("localizes core status/init/demo/doctor labels in zh-CN", () => {
    const keys = [
      "cli.status.intro",
      "cli.status.health",
      "cli.init.intro",
      "cli.init.noteTitle",
      "cli.demo.intro",
      "cli.demo.searchResults",
      "cli.doctor.intro",
      "cli.doctor.allPassing",
    ];

    for (const key of keys) {
      const value = t("zh-CN", key);
      expect(value).not.toBe(t("en", key));
      expect(value).toMatch(cjk);
    }
  });

  it("preserves commands, env vars, URLs, and API paths inside localized CLI text", () => {
    expect(t("zh-CN", "cli.common.startWith")).toContain("npx @agentmemory/agentmemory");

    const helpText = t("zh-CN", "cli.help.text", { pinnedVersion: "0.11.2" });
    expect(helpText).toContain("用法");
    expect(helpText).toContain("connect [agent]");
    expect(helpText).toContain("AGENTMEMORY_LOCALE");
    expect(helpText).toContain("http://localhost:3111");
    expect(helpText).toContain("0.11.2");

    const initNote = t("zh-CN", "cli.init.note");
    expect(initNote).toContain("ANTHROPIC_API_KEY");
    expect(initNote).toContain("OPENAI_API_KEY");
    expect(initNote).toContain("npx @agentmemory/agentmemory doctor");

    const demoError = t("zh-CN", "cli.demo.notReachable", { port: 3111 });
    expect(demoError).toContain("3111");
    expect(demoError).toContain("/agentmemory/*");
  });

  it("formats demo summary lines in zh-CN without translating query examples", () => {
    expect(t("zh-CN", "cli.demo.sessionSummary", {
      sessions: 3,
      observations: 6,
    })).toBe("已写入 3 个会话（6 条观察）");
    expect(t("zh-CN", "cli.demo.notice")).toContain("database performance optimization");
    expect(t("zh-CN", "cli.demo.hitLine", {
      hits: 2,
      title: "N+1 query fix",
    })).toContain("N+1 query fix");
  });

  it("has zh-CN keys for non-key-path CLI commands", () => {
    const keys = [
      "cli.engine.startFailed",
      "cli.upgrade.note",
      "cli.stop.stopped",
      "cli.remove.done",
      "cli.importJsonl.timedOut",
    ];
    for (const key of keys) {
      expect(t("zh-CN", key)).toMatch(cjk);
      expect(t("zh-CN", key)).not.toBe(t("en", key));
    }
  });

  it("routes top-level CLI command copy through locale keys", () => {
    const source = readFileSync(new URL("../src/cli.ts", import.meta.url), "utf-8");
    const forbidden = [
      'p.log.info(`Attached to existing iii-engine (pid ${enginePid})`)',
      'p.log.warn("curl or sh not found. Cannot auto-install iii-engine.")',
      'p.log.info("Non-interactive environment detected — auto-installing iii-engine.")',
      'p.log.warn(`iii-engine binary not found locally.`)',
      'message: "How would you like to start iii-engine?"',
      'message: "Auto-install failed. Try Docker compose instead?"',
      'if (IS_VERBOSE) p.log.info("Skipping engine check (--no-engine)")',
      'if (IS_VERBOSE) p.log.success("iii-engine is running")',
      'p.log.error("Could not start iii-engine.")',
      'p.note(lines.join("\\n"), "Setup required")',
      'p.log.error("The iii-engine process crashed on startup.")',
      'p.log.info(`Binary: ${startupFailure.binary}`)',
      'p.note(startupFailure.stderr, "engine stderr")',
      'p.log.info("No stderr was captured. Re-run with --verbose for more detail.")',
      'p.log.error("The engine process started but the REST API never responded.")',
      'p.intro("agentmemory upgrade")',
      'p.log.info(`Working directory: ${cwd}`)',
      'p.log.error(`Upgrade aborted: ${label} failed.`)',
      'message: "Re-run the iii-engine install script (curl | sh)?"',
      'p.log.info("Skipped iii-engine installer.")',
      'p.log.info("Docker not found. Skipping Docker image refresh.")',
      'p.intro("agentmemory stop")',
      'p.log.info(`No engine responding on port ${port}.`)',
      'p.outro("Nothing to stop.")',
      's.start(`Stopping iii-engine (pid ${pid})...`)',
      's.stop(ok ? `Stopped pid ${pid}` : `Failed to stop pid ${pid}`)',
      'p.log.error("One or more processes survived SIGKILL. Investigate with `ps`.")',
      'p.outro("Stopped. Memories persisted to disk; restart anytime with: npx @agentmemory/agentmemory")',
      'p.log.warn(`Ignoring --max-files ${raw}: expected a positive integer.`)',
      'p.log.warn(`Ignoring --max-files=${raw}: expected a positive integer.`)',
      'p.log.info(`Importing JSONL from ${pathArg || "~/.claude/projects"}…`)',
      'p.log.info(`View at ${getViewerUrl()} → Replay tab`)',
      'p.log.error("import timed out after 2 minutes")',
      'p.intro("agentmemory remove")',
      'p.outro("Nothing to remove. agentmemory is already gone.")',
      'p.note(formatPlan(plan), "destruction plan")',
      'message: "Proceed with these deletions?"',
      'message: "This is irreversible. Continue?"',
      'p.outro("Cancelled. Nothing was deleted.")',
      '"Done. agentmemory cleanly removed. The npm package itself: npm uninstall -g @agentmemory/agentmemory"',
    ];

    for (const literal of forbidden) {
      expect(source).not.toContain(literal);
    }
  });
});
