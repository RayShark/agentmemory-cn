import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { cliTFor, currentCliLocale } from "../i18n.js";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import {
  AGENTMEMORY_MCP_BLOCK,
  backupFile,
  logAlreadyWired,
  logBackup,
  logInstalled,
  readJsonSafe,
  writeJsonAtomic,
} from "./util.js";
import {
  buildMergedHooks,
  findPluginRoot,
  type HookManifest,
} from "./codex-hooks.js";
import { resolvePluginManifestForLocale } from "./plugin-locale.js";

const CLAUDE_DIR = join(homedir(), ".claude");
const CLAUDE_JSON = join(homedir(), ".claude.json");
const CLAUDE_SETTINGS = join(CLAUDE_DIR, "settings.json");

type ClaudeMcpEntry = typeof AGENTMEMORY_MCP_BLOCK;
type ClaudeConfig = {
  mcpServers?: Record<string, ClaudeMcpEntry>;
  [key: string]: unknown;
};

function entryMatches(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  if (e["command"] !== "npx") return false;
  const args = Array.isArray(e["args"]) ? (e["args"] as string[]) : [];
  return args.includes("@agentmemory/mcp");
}

export const adapter: ConnectAdapter = {
  name: "claude-code",
  displayName: "Claude Code",
  category: "native",
  docs: "https://github.com/rohitg00/agentmemory#claude-code-one-block-paste-it",
  protocolNote:
    "→ Using MCP. Hooks are also available — see https://github.com/rohitg00/agentmemory#claude-code-one-block-paste-it.",

  detect(): boolean {
    return existsSync(CLAUDE_DIR);
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const locale = opts.locale ?? currentCliLocale();
    const pluginManifest = resolvePluginManifestForLocale("claude", locale, {
      write: !opts.dryRun,
    });
    if (pluginManifest.staged) {
      p.log.info(
        cliTFor(
          locale,
          opts.dryRun
            ? "connect.pluginManifestDryRun"
            : "connect.pluginManifestReady",
          { agent: "Claude Code", path: pluginManifest.manifestPath },
        ),
      );
    }

    const existing = readJsonSafe<ClaudeConfig>(CLAUDE_JSON);
    const next: ClaudeConfig = existing ? { ...existing } : {};
    const servers: Record<string, ClaudeMcpEntry> = {
      ...((next.mcpServers as Record<string, ClaudeMcpEntry>) ?? {}),
    };

    const alreadyHas = entryMatches(servers["agentmemory"]);
    if (alreadyHas && !opts.force) {
      logAlreadyWired("Claude Code", CLAUDE_JSON, locale);
      // --with-hooks is independent of MCP wiring (issue #508). Run the
      // hooks fallback even when MCP is already in place so users with a
      // healthy MCP setup can still pick up version-stable hook paths.
      if (opts.withHooks) {
        const hookResult = installClaudeHooks(opts);
        if (hookResult.kind === "skipped") {
          p.log.warn(
            cliTFor(locale, "connect.claudeCode.hooksSkipped", {
              reason: hookResult.reason,
            }),
          );
        }
      }
      return { kind: "already-wired", mutatedPath: CLAUDE_JSON };
    }

    if (opts.dryRun) {
      p.log.info(
        cliTFor(
          locale,
          alreadyHas
            ? "connect.claudeCode.dryRunOverwrite"
            : "connect.claudeCode.dryRunAdd",
          { path: CLAUDE_JSON },
        ),
      );
      return { kind: "installed", mutatedPath: CLAUDE_JSON };
    }

    let backupPath: string | undefined;
    if (existsSync(CLAUDE_JSON)) {
      backupPath = backupFile(CLAUDE_JSON, "claude-code");
      logBackup(backupPath, locale);
    } else {
      mkdirSync(CLAUDE_DIR, { recursive: true });
      writeFileSync(CLAUDE_JSON, "{}\n", "utf-8");
    }

    servers["agentmemory"] = AGENTMEMORY_MCP_BLOCK;
    next.mcpServers = servers;
    writeJsonAtomic(CLAUDE_JSON, next);

    const verify = readJsonSafe<ClaudeConfig>(CLAUDE_JSON);
    if (!entryMatches(verify?.mcpServers?.["agentmemory"])) {
      p.log.error(
        cliTFor(locale, "connect.claudeCode.verificationFailed", {
          path: CLAUDE_JSON,
        }),
      );
      return { kind: "skipped", reason: "verification-failed" };
    }

    logInstalled("Claude Code", CLAUDE_JSON, locale);
    p.log.info(cliTFor(locale, "connect.claudeCode.restart"));

    if (opts.withHooks) {
      const hookResult = installClaudeHooks(opts);
      if (hookResult.kind === "skipped") {
        p.log.warn(
          cliTFor(locale, "connect.claudeCode.hooksSkippedMcpStillApplied", {
            reason: hookResult.reason,
          }),
        );
      }
    }

    return { kind: "installed", mutatedPath: CLAUDE_JSON, backupPath };
  },
};

/**
 * Merge the bundled `plugin/hooks/hooks.json` into
 * `~/.claude/settings.json`'s top-level `hooks` field with absolute
 * script paths. Use this when agentmemory is NOT installed through
 * `/plugin marketplace add` (e.g. MCP standalone wiring), so the
 * hook scripts survive version bumps without `${CLAUDE_PLUGIN_ROOT}`
 * expansion (issue #508).
 *
 * Re-install strips entries whose command points under
 * `<pluginRoot>/scripts/`; unrelated user hook entries survive.
 */
function installClaudeHooks(opts: ConnectOptions): ConnectResult {
  const locale = opts.locale ?? currentCliLocale();
  let pluginRoot: string;
  try {
    pluginRoot = findPluginRoot();
  } catch (err) {
    return {
      kind: "skipped",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  type ClaudeSettings = { hooks?: HookManifest["hooks"]; [key: string]: unknown };
  const existing = readJsonSafe<ClaudeSettings>(CLAUDE_SETTINGS) ?? {};
  const existingHooks: HookManifest | null = existing.hooks
    ? { hooks: existing.hooks }
    : null;
  const merged = buildMergedHooks(existingHooks, pluginRoot, "hooks.json");

  if (opts.dryRun) {
    p.log.info(
      cliTFor(locale, "connect.claudeCode.hooksDryRun", {
        path: CLAUDE_SETTINGS,
        count: Object.keys(merged.hooks).length,
      }),
    );
    return { kind: "installed", mutatedPath: CLAUDE_SETTINGS };
  }

  let backupPath: string | undefined;
  if (existsSync(CLAUDE_SETTINGS)) {
    backupPath = backupFile(CLAUDE_SETTINGS, "claude-settings", "json");
    logBackup(backupPath, locale);
  } else {
    mkdirSync(CLAUDE_DIR, { recursive: true });
  }

  const next: ClaudeSettings = { ...existing, hooks: merged.hooks };
  writeJsonAtomic(CLAUDE_SETTINGS, next);

  logInstalled(
    cliTFor(locale, "connect.claudeCode.hooksInstalled"),
    CLAUDE_SETTINGS,
    locale,
  );
  p.log.info(cliTFor(locale, "connect.claudeCode.hooksRefresh"));

  return {
    kind: "installed",
    mutatedPath: CLAUDE_SETTINGS,
    ...(backupPath !== undefined && { backupPath }),
  };
}
