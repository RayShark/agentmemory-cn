import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolvePluginManifestForLocale } from "../src/cli/connect/plugin-locale.js";

const repoRoot = resolve(__dirname, "..");
const pluginRoot = join(repoRoot, "plugin");

function skillNames(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(root, name, "SKILL.md")))
    .sort();
}

function fileNames(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

function frontmatter(path: string): string {
  const content = readFileSync(path, "utf-8");
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  expect(match, `${path} should start with YAML frontmatter`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("plugin i18n assets", () => {
  it("documents locale-aware OpenCode connect command selection", () => {
    const readme = readFileSync(join(pluginRoot, "opencode", "README.md"), "utf-8");

    expect(readme).toContain("agentmemory connect opencode");
    expect(readme).toContain("AGENTMEMORY_LOCALE=zh-CN");
    expect(readme).toContain("commands.zh-CN");
  });

  it("keeps static Codex/Claude manifests pointed at bundled skills", () => {
    const codex = JSON.parse(
      readFileSync(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf-8"),
    );
    const claude = JSON.parse(
      readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf-8"),
    );

    expect(codex.skills).toBe("./skills/");
    expect(claude.skills).toEqual(["./skills/"]);
    expect(codex.description).toContain("持久化记忆");
    expect(claude.description).toContain("持久化记忆");
    expect(codex.description).toContain("英文技能");
    expect(claude.description).toContain("英文技能");
  });

  it("generates zh-CN Codex and Claude plugin manifests in locale staging", () => {
    const tmpHome = mkdtempSync(join(tmpdir(), "am-plugin-i18n-"));
    const originalHome = process.env["HOME"];
    const originalUserprofile = process.env["USERPROFILE"];

    try {
      process.env["HOME"] = tmpHome;
      process.env["USERPROFILE"] = tmpHome;

      const codex = resolvePluginManifestForLocale("codex", "zh-CN");
      const expectedRoot = join(
        tmpHome,
        ".agentmemory",
        "plugins",
        "agentmemory.zh-CN",
      );

      expect(codex.staged).toBe(true);
      expect(codex.pluginRoot).toBe(expectedRoot);
      expect(codex.manifestPath).toBe(
        join(expectedRoot, ".codex-plugin", "plugin.json"),
      );

      const claudeManifestPath = join(expectedRoot, ".claude-plugin", "plugin.json");
      const codexManifest = JSON.parse(readFileSync(codex.manifestPath, "utf-8"));
      const claudeManifest = JSON.parse(readFileSync(claudeManifestPath, "utf-8"));

      expect(codexManifest.skills).toBe("./skills.zh-CN/");
      expect(claudeManifest.skills).toEqual(["./skills.zh-CN/"]);
      expect(codexManifest.description).toContain("持久化记忆");
      expect(claudeManifest.description).toContain("持久化记忆");
      expect(codexManifest.description).not.toContain("Persistent memory");
      expect(claudeManifest.description).not.toContain("Persistent memory");
      expect(codexManifest.mcpServers).toBe("./.mcp.json");
      expect(codexManifest.hooks).toBe("./hooks/hooks.codex.json");
      expect(existsSync(join(expectedRoot, "skills.zh-CN", "recap", "SKILL.md"))).toBe(
        true,
      );
      expect(existsSync(join(expectedRoot, "scripts", "session-start.mjs"))).toBe(
        true,
      );
    } finally {
      if (originalHome !== undefined) process.env["HOME"] = originalHome;
      else delete process.env["HOME"];
      if (originalUserprofile !== undefined)
        process.env["USERPROFILE"] = originalUserprofile;
      else delete process.env["USERPROFILE"];
      rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  it("returns bundled English plugin manifests without locale staging", () => {
    const codex = resolvePluginManifestForLocale("codex", "en");
    const claude = resolvePluginManifestForLocale("claude", "en");

    expect(codex.staged).toBe(false);
    expect(claude.staged).toBe(false);
    expect(codex.pluginRoot).toBe(pluginRoot);
    expect(claude.pluginRoot).toBe(pluginRoot);
    expect(codex.manifestPath).toBe(
      join(pluginRoot, ".codex-plugin", "plugin.json"),
    );
    expect(claude.manifestPath).toBe(
      join(pluginRoot, ".claude-plugin", "plugin.json"),
    );
  });

  it("ships one zh-CN skill for every English skill", () => {
    const englishRoot = join(pluginRoot, "skills");
    const chineseRoot = join(pluginRoot, "skills.zh-CN");

    expect(existsSync(chineseRoot)).toBe(true);
    expect(skillNames(chineseRoot)).toEqual(skillNames(englishRoot));
  });

  it("keeps zh-CN skill frontmatter machine-readable and untranslated", () => {
    const englishRoot = join(pluginRoot, "skills");
    const chineseRoot = join(pluginRoot, "skills.zh-CN");

    for (const name of skillNames(englishRoot)) {
      const englishSkill = join(englishRoot, name, "SKILL.md");
      const chineseSkill = join(chineseRoot, name, "SKILL.md");
      expect(existsSync(chineseSkill), `missing zh-CN skill: ${name}`).toBe(true);
      const zhFrontmatter = frontmatter(chineseSkill);
      expect(zhFrontmatter).toContain(`name: ${name}`);
      expect(zhFrontmatter).toContain("user-invocable: true");
      expect(zhFrontmatter).toContain("description:");
      expect(zhFrontmatter).not.toBe(frontmatter(englishSkill));
    }
  });

  it("ships zh-CN OpenCode commands matching the English command files", () => {
    const englishRoot = join(pluginRoot, "opencode", "commands");
    const chineseRoot = join(pluginRoot, "opencode", "commands.zh-CN");

    expect(existsSync(chineseRoot)).toBe(true);
    expect(fileNames(chineseRoot)).toEqual(fileNames(englishRoot));
  });

  it("localizes zh-CN OpenCode command headings", () => {
    const chineseRoot = join(pluginRoot, "opencode", "commands.zh-CN");

    for (const file of fileNames(chineseRoot)) {
      const content = readFileSync(join(chineseRoot, file), "utf-8");
      expect(content, file).toContain("## 用法");
      expect(content, file).toContain("## 执行说明");
      expect(content, file).not.toContain("## Usage");
      expect(content, file).not.toContain("## Instructions");
    }
  });

  it("zh-CN recap skill asks for a Chinese final total", () => {
    const content = readFileSync(
      join(pluginRoot, "skills.zh-CN", "recap", "SKILL.md"),
      "utf-8",
    );

    expect(content).toContain("共 N 个会话");
    expect(content).not.toContain("N sessions across M days");
  });
});
