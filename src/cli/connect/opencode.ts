import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as p from "@clack/prompts";
import type { Locale } from "../../i18n/locale.js";
import { currentCliLocale, cliTFor } from "../i18n.js";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import {
  backupFile,
  logAlreadyWired,
  logBackup,
  logInstalled,
  readJsonSafe,
  writeJsonAtomic,
} from "./util.js";
import { findPluginRoot } from "./codex-hooks.js";

const OPENCODE_PLUGIN_ENTRY = "./plugins/agentmemory-capture.ts";
const OPENCODE_MCP_BLOCK = {
  type: "local",
  command: ["npx", "-y", "@agentmemory/mcp"],
  enabled: true,
};

type OpencodeMcpEntry = typeof OPENCODE_MCP_BLOCK;
type OpencodeConfig = {
  mcp?: Record<string, OpencodeMcpEntry>;
  plugin?: string[];
  [key: string]: unknown;
};

function opencodeDir(): string {
  const xdgConfigHome = process.env["XDG_CONFIG_HOME"]?.trim();
  const configHome = xdgConfigHome || join(homedir(), ".config");
  return join(configHome, "opencode");
}

function opencodeConfigPath(): string {
  return join(opencodeDir(), "opencode.json");
}

function selectedCommandsDir(
  pluginRoot: string,
  locale: Locale | undefined,
): string {
  return join(
    pluginRoot,
    "opencode",
    locale === "zh-CN" ? "commands.zh-CN" : "commands",
  );
}

function entryMatches(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  if (e["type"] !== "local") return false;
  if (e["enabled"] !== true) return false;
  const command = Array.isArray(e["command"])
    ? (e["command"] as unknown[])
    : [];
  return (
    command.every((part) => typeof part === "string") &&
    command.includes("@agentmemory/mcp")
  );
}

function pluginEntryMatches(value: unknown): boolean {
  return Array.isArray(value) && value.includes(OPENCODE_PLUGIN_ENTRY);
}

function fileContentsMatch(source: string, target: string): boolean {
  if (!existsSync(target)) return false;
  return readFileSync(source, "utf-8") === readFileSync(target, "utf-8");
}

function commandFileNames(sourceDir: string): string[] {
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

function copyAsset(source: string, target: string, force: boolean): boolean {
  if (existsSync(target) && !force) return false;
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  return true;
}

function allAssetsMatch(
  pluginRoot: string,
  commandsSourceDir: string,
  commandNames: string[],
): boolean {
  const root = opencodeDir();
  const pluginSource = join(pluginRoot, "opencode", "agentmemory-capture.ts");
  const pluginTarget = join(root, "plugins", "agentmemory-capture.ts");
  if (!fileContentsMatch(pluginSource, pluginTarget)) return false;
  return commandNames.every((name) =>
    fileContentsMatch(
      join(commandsSourceDir, name),
      join(root, "commands", name),
    ),
  );
}

function mergeConfig(existing: OpencodeConfig | null): OpencodeConfig {
  const next: OpencodeConfig = existing ? { ...existing } : {};
  next.mcp = {
    ...((next.mcp as Record<string, OpencodeMcpEntry>) ?? {}),
    agentmemory: OPENCODE_MCP_BLOCK,
  };

  const plugins = Array.isArray(next.plugin)
    ? next.plugin.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (!plugins.includes(OPENCODE_PLUGIN_ENTRY)) {
    plugins.push(OPENCODE_PLUGIN_ENTRY);
  }
  next.plugin = plugins;
  return next;
}

export const adapter: ConnectAdapter = {
  name: "opencode",
  displayName: "OpenCode",
  docs: "https://github.com/rohitg00/agentmemory/tree/main/plugin/opencode",
  protocolNote:
    "→ Using OpenCode's top-level mcp config plus the bundled agentmemory plugin and slash commands.",

  detect(): boolean {
    return existsSync(opencodeDir());
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const locale = opts.locale ?? currentCliLocale();
    const configPath = opencodeConfigPath();
    const root = opencodeDir();
    const pluginRoot = findPluginRoot();
    const commandsSourceDir = selectedCommandsDir(pluginRoot, locale);
    const commandNames = commandFileNames(commandsSourceDir);
    const existing = readJsonSafe<OpencodeConfig>(configPath);
    const alreadyWired =
      entryMatches(existing?.mcp?.["agentmemory"]) &&
      pluginEntryMatches(existing?.plugin) &&
      allAssetsMatch(pluginRoot, commandsSourceDir, commandNames);

    if (alreadyWired && !opts.force) {
      logAlreadyWired("OpenCode", configPath, locale);
      return { kind: "already-wired", mutatedPath: configPath };
    }

    if (opts.dryRun) {
      p.log.info(
        cliTFor(
          locale,
          existing
            ? "connect.opencode.dryRunMergeConfig"
            : "connect.opencode.dryRunCreateConfig",
          { path: configPath },
        ),
      );
      p.log.info(
        cliTFor(locale, "connect.opencode.dryRunCopyCommands", {
          language: locale === "zh-CN" ? "zh-CN" : "English",
          path: commandsSourceDir,
        }),
      );
      return { kind: "installed", mutatedPath: configPath };
    }

    let backupPath: string | undefined;
    if (existsSync(configPath)) {
      backupPath = backupFile(configPath, "opencode");
      logBackup(backupPath, locale);
    } else {
      mkdirSync(root, { recursive: true });
    }

    writeJsonAtomic(configPath, mergeConfig(existing));

    const verify = readJsonSafe<OpencodeConfig>(configPath);
    if (
      !entryMatches(verify?.mcp?.["agentmemory"]) ||
      !pluginEntryMatches(verify?.plugin)
    ) {
      p.log.error(
        cliTFor(locale, "connect.opencode.verificationFailed", {
          path: configPath,
        }),
      );
      return { kind: "skipped", reason: "verification-failed" };
    }

    const pluginSource = join(pluginRoot, "opencode", "agentmemory-capture.ts");
    const pluginTarget = join(root, "plugins", "agentmemory-capture.ts");
    const copiedPlugin = copyAsset(pluginSource, pluginTarget, opts.force);
    if (!copiedPlugin && !fileContentsMatch(pluginSource, pluginTarget)) {
      p.log.info(
        cliTFor(locale, "connect.opencode.pluginExists", {
          path: pluginTarget,
        }),
      );
    }

    for (const name of commandNames) {
      const source = join(commandsSourceDir, name);
      const target = join(root, "commands", name);
      const copied = copyAsset(source, target, opts.force);
      if (!copied && !fileContentsMatch(source, target)) {
        p.log.info(
          cliTFor(locale, "connect.opencode.commandExists", {
            name,
            path: target,
          }),
        );
      }
    }

    logInstalled("OpenCode", configPath, locale);
    return {
      kind: "installed",
      mutatedPath: configPath,
      ...(backupPath !== undefined && { backupPath }),
    };
  },
};
