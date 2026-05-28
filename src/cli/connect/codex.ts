import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import * as p from "@clack/prompts";
import { cliTFor, currentCliLocale } from "../i18n.js";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import {
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

const CODEX_DIR = join(homedir(), ".codex");
const CODEX_TOML = join(CODEX_DIR, "config.toml");
const CODEX_HOOKS = join(CODEX_DIR, "hooks.json");

const TOML_BLOCK = `[mcp_servers.agentmemory]
command = "npx"
args = ["-y", "@agentmemory/mcp"]

[mcp_servers.agentmemory.env]
AGENTMEMORY_URL = "http://localhost:3111"
`;

const SECTION_HEADER = "[mcp_servers.agentmemory]";

function isWiredText(toml: string): boolean {
  return toml.includes(SECTION_HEADER);
}

function stripExistingBlock(toml: string): string {
  const lines = toml.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed === SECTION_HEADER ||
      trimmed === "[mcp_servers.agentmemory.env]"
    ) {
      skipping = true;
      continue;
    }
    if (
      skipping &&
      trimmed.startsWith("[") &&
      trimmed !== "[mcp_servers.agentmemory.env]"
    ) {
      skipping = false;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}$/, "\n\n").trimEnd() + "\n";
}

export const adapter: ConnectAdapter = {
  name: "codex",
  displayName: "Codex CLI",
  docs: "https://github.com/rohitg00/agentmemory#codex-cli-codex-plugin-platform",
  protocolNote:
    "→ Using MCP. Hooks ship via the Codex plugin; on Codex Desktop, also pass --with-hooks to install the global hooks.json workaround for openai/codex#16430.",

  detect(): boolean {
    return existsSync(CODEX_DIR);
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const locale = opts.locale ?? currentCliLocale();
    const pluginManifest = resolvePluginManifestForLocale("codex", locale, {
      write: !opts.dryRun,
    });
    if (pluginManifest.staged) {
      p.log.info(
        cliTFor(
          locale,
          opts.dryRun
            ? "connect.pluginManifestDryRun"
            : "connect.pluginManifestReady",
          { agent: "Codex CLI", path: pluginManifest.manifestPath },
        ),
      );
    }

    const exists = existsSync(CODEX_TOML);
    const current = exists ? readFileSync(CODEX_TOML, "utf-8") : "";
    const wired = isWiredText(current);

    if (wired && !opts.force) {
      logAlreadyWired("Codex CLI", CODEX_TOML, locale);
      return { kind: "already-wired", mutatedPath: CODEX_TOML };
    }

    if (opts.dryRun) {
      p.log.info(
        cliTFor(
          locale,
          wired ? "connect.codex.dryRunRewrite" : "connect.codex.dryRunAppend",
          { path: CODEX_TOML },
        ),
      );
      if (opts.withHooks) installCodexHooks(opts);
      return { kind: "installed", mutatedPath: CODEX_TOML };
    }

    let backupPath: string | undefined;
    if (exists) {
      backupPath = backupFile(CODEX_TOML, "codex", "toml");
      logBackup(backupPath, locale);
    } else {
      mkdirSync(dirname(CODEX_TOML), { recursive: true });
    }

    const cleaned = wired ? stripExistingBlock(current) : current;
    const joiner = cleaned.length === 0 || cleaned.endsWith("\n") ? "" : "\n";
    const next = `${cleaned}${joiner}${cleaned.length > 0 ? "\n" : ""}${TOML_BLOCK}`;
    writeFileSync(CODEX_TOML, next, "utf-8");

    const verify = readFileSync(CODEX_TOML, "utf-8");
    if (!isWiredText(verify)) {
      p.log.error(
        cliTFor(locale, "connect.codex.verificationFailed", { path: CODEX_TOML }),
      );
      return { kind: "skipped", reason: "verification-failed" };
    }

    logInstalled("Codex CLI", CODEX_TOML, locale);
    p.log.info(cliTFor(locale, "connect.codex.nextLaunch"));

    if (opts.withHooks) {
      const hookResult = installCodexHooks(opts);
      if (hookResult.kind === "skipped") {
        p.log.warn(
          cliTFor(locale, "connect.codex.hooksSkipped", {
            reason: hookResult.reason,
          }),
        );
      }
    }

    return {
      kind: "installed",
      mutatedPath: CODEX_TOML,
      ...(backupPath !== undefined && { backupPath }),
    };
  },
};

/**
 * Install the global `~/.codex/hooks.json` fallback. See
 * `codex-hooks.ts` for context (openai/codex#16430). Returns a result
 * describing the side effect for the caller's summary; failures here do
 * not roll back the MCP wiring.
 */
function installCodexHooks(opts: ConnectOptions): ConnectResult {
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

  const existing = readJsonSafe<HookManifest>(CODEX_HOOKS);
  const merged = buildMergedHooks(existing, pluginRoot);

  if (opts.dryRun) {
    p.log.info(
      cliTFor(
        locale,
        existing
          ? "connect.codex.hooksDryRunMerge"
          : "connect.codex.hooksDryRunCreate",
        { path: CODEX_HOOKS, count: Object.keys(merged.hooks).length },
      ),
    );
    return { kind: "installed", mutatedPath: CODEX_HOOKS };
  }

  let backupPath: string | undefined;
  if (existsSync(CODEX_HOOKS)) {
    backupPath = backupFile(CODEX_HOOKS, "codex-hooks", "json");
    logBackup(backupPath, locale);
  }

  writeJsonAtomic(CODEX_HOOKS, merged);

  logInstalled(
    cliTFor(locale, "connect.codex.hooksInstalled"),
    CODEX_HOOKS,
    locale,
  );
  p.log.info(cliTFor(locale, "connect.codex.hooksRefresh"));

  return {
    kind: "installed",
    mutatedPath: CODEX_HOOKS,
    ...(backupPath !== undefined && { backupPath }),
  };
}
