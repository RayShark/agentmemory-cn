import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Locale } from "../../i18n/locale.js";
import { findPluginRoot } from "./codex-hooks.js";
import { writeJsonAtomic } from "./util.js";

export type PluginManifestTarget = "claude" | "codex";

export type LocalePluginManifest = {
  target: PluginManifestTarget;
  locale: Locale;
  pluginRoot: string;
  manifestPath: string;
  staged: boolean;
};

type ResolveOptions = {
  write?: boolean;
};

const MANIFEST_DIRS: Record<PluginManifestTarget, string> = {
  claude: ".claude-plugin",
  codex: ".codex-plugin",
};

const ZH_CN_SKILLS_PATH = "./skills.zh-CN/";
const ZH_CN_PLUGIN_DESCRIPTIONS: Record<PluginManifestTarget, string> = {
  claude:
    "面向 AI 编码代理的持久化记忆：捕获工具使用，通过 LLM 压缩，并向后续会话注入上下文。12 个钩子、53 个 MCP 工具、8 个中文技能、实时查看器。",
  codex:
    "面向 AI 编码代理的持久化记忆：捕获工具使用，通过 LLM 压缩，并向后续会话注入上下文。6 个钩子、53 个 MCP 工具、8 个中文技能、实时查看器。",
};

export function resolvePluginManifestForLocale(
  target: PluginManifestTarget,
  locale: Locale,
  options: ResolveOptions = {},
): LocalePluginManifest {
  const bundledRoot = findPluginRoot();

  if (locale !== "zh-CN") {
    return {
      target,
      locale,
      pluginRoot: bundledRoot,
      manifestPath: manifestPath(bundledRoot, target),
      staged: false,
    };
  }

  const pluginRoot = localePluginStagingRoot();
  if (options.write !== false) {
    writeZhCnPluginStaging(bundledRoot, pluginRoot);
  }

  return {
    target,
    locale,
    pluginRoot,
    manifestPath: manifestPath(pluginRoot, target),
    staged: true,
  };
}

export function localePluginStagingRoot(): string {
  return join(homedir(), ".agentmemory", "plugins", "agentmemory.zh-CN");
}

function writeZhCnPluginStaging(bundledRoot: string, pluginRoot: string): void {
  mkdirSync(pluginRoot, { recursive: true });

  for (const relativePath of ["skills.zh-CN", "hooks", "scripts", ".mcp.json"]) {
    cpSync(join(bundledRoot, relativePath), join(pluginRoot, relativePath), {
      force: true,
      recursive: true,
    });
  }

  writeLocaleManifest(bundledRoot, pluginRoot, "codex");
  writeLocaleManifest(bundledRoot, pluginRoot, "claude");
}

function writeLocaleManifest(
  bundledRoot: string,
  pluginRoot: string,
  target: PluginManifestTarget,
): void {
  const source = JSON.parse(
    readFileSync(manifestPath(bundledRoot, target), "utf-8"),
  ) as Record<string, unknown>;

  source["skills"] = target === "codex" ? ZH_CN_SKILLS_PATH : [ZH_CN_SKILLS_PATH];
  source["description"] = ZH_CN_PLUGIN_DESCRIPTIONS[target];
  writeJsonAtomic(manifestPath(pluginRoot, target), source);
}

function manifestPath(pluginRoot: string, target: PluginManifestTarget): string {
  return join(pluginRoot, MANIFEST_DIRS[target], "plugin.json");
}
