import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = resolve(__dirname, "..");
const pluginRoot = join(repoRoot, "plugin");

function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

type HookHandler = { type: string; command: string };
type HookEntry = { hooks: HookHandler[] };

function hookCommands(path: string): string[] {
  const manifest = readJson<{ hooks: Record<string, HookEntry[]> }>(path);
  return Object.values(manifest.hooks).flatMap((entries) =>
    entries.flatMap((entry) => entry.hooks.map((handler) => handler.command)),
  );
}

describe("Plugin hook manifests", () => {
  it("route hooks through the best-effort wrapper so roots with spaces stay intact", () => {
    for (const manifest of ["hooks.json", "hooks.codex.json"]) {
      const commands = hookCommands(join(pluginRoot, "hooks", manifest));
      expect(commands.length, `${manifest} should contain hook commands`).toBeGreaterThan(0);

      for (const command of commands) {
        expect(command).toMatch(
          /^bash "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/run-hook\.sh" [^\s"]+\.mjs$/,
        );
      }
    }
  });

  it("wrapper exits zero when the requested hook script is missing", () => {
    const wrapper = join(pluginRoot, "scripts/run-hook.sh");
    const result = spawnSync("bash", [wrapper, "missing-hook.mjs"], {
      cwd: repoRoot,
      env: {
        HOME: process.env["HOME"] ?? "",
        PATH: process.env["PATH"] ?? "",
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        AGENTMEMORY_HOOK_LOG: join(tmpdir(), "agentmemory-test-hook-missing.log"),
      },
      encoding: "utf-8",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("wrapper exits zero when node is present but the hook process fails", () => {
    const wrapper = join(pluginRoot, "scripts/run-hook.sh");
    const result = spawnSync("bash", [wrapper, "post-tool-use.mjs"], {
      cwd: repoRoot,
      env: {
        HOME: process.env["HOME"] ?? "",
        PATH: process.env["PATH"] ?? "",
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        AGENTMEMORY_NODE: "/bin/false",
        AGENTMEMORY_HOOK_LOG: join(tmpdir(), "agentmemory-test-hook-node-fails.log"),
      },
      input: "{}",
      encoding: "utf-8",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});

describe("Codex plugin manifest (developers.openai.com/codex/plugins)", () => {
  it("ships .codex-plugin/plugin.json with kebab-case name + version + references", () => {
    const manifestPath = join(pluginRoot, ".codex-plugin/plugin.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = readJson<{
      name: string;
      version: string;
      description?: string;
      skills?: string;
      mcpServers?: string;
      hooks?: string;
    }>(manifestPath);
    expect(manifest.name).toBe("agentmemory");
    expect(manifest.name).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(manifest.skills).toBeDefined();
    expect(manifest.mcpServers).toBeDefined();
    expect(manifest.hooks).toBeDefined();
  });

  it("manifest version matches main package.json", () => {
    const pkgVer = readJson<{ version: string }>(join(repoRoot, "package.json")).version;
    const codexVer = readJson<{ version: string }>(
      join(pluginRoot, ".codex-plugin/plugin.json"),
    ).version;
    expect(codexVer).toBe(pkgVer);
  });

  it("all referenced manifest paths resolve to existing files / directories", () => {
    const manifest = readJson<{ skills: string; mcpServers: string; hooks: string }>(
      join(pluginRoot, ".codex-plugin/plugin.json"),
    );
    expect(existsSync(join(pluginRoot, manifest.skills))).toBe(true);
    expect(existsSync(join(pluginRoot, manifest.mcpServers))).toBe(true);
    expect(existsSync(join(pluginRoot, manifest.hooks))).toBe(true);
  });

  it("plugin MCP server launches through the env-loading wrapper", () => {
    const mcp = readJson<{
      mcpServers: Record<
        string,
        {
          command: string;
          args: string[];
        }
      >;
    }>(join(pluginRoot, ".mcp.json"));

    expect(mcp.mcpServers.agentmemory?.command).toBe("bash");
    expect(mcp.mcpServers.agentmemory?.args[0]).toBe("-lc");
    expect(mcp.mcpServers.agentmemory?.args[1]).toContain("CLAUDE_PLUGIN_ROOT");
    expect(mcp.mcpServers.agentmemory?.args[1]).toContain("scripts/run-mcp.sh");
    expect(mcp.mcpServers.agentmemory?.args[1]).toContain("@agentmemory/mcp");
    expect(existsSync(join(pluginRoot, "scripts/run-mcp.sh"))).toBe(true);
  });

  it("hooks.codex.json contains only events Codex supports (no Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure)", () => {
    const hooksPath = join(pluginRoot, "hooks/hooks.codex.json");
    const hooks = readJson<{ hooks: Record<string, unknown> }>(hooksPath);
    const events = Object.keys(hooks.hooks);
    const codexSupported = new Set([
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "PermissionRequest",
      "PreCompact",
      "PostCompact",
      "Stop",
    ]);
    for (const event of events) {
      expect(codexSupported.has(event), `unexpected event "${event}" in hooks.codex.json`).toBe(true);
    }
    expect(events).toContain("SessionStart");
    expect(events).toContain("UserPromptSubmit");
    expect(events).toContain("PreToolUse");
    expect(events).toContain("PostToolUse");
    expect(events).toContain("PreCompact");
    expect(events).toContain("Stop");
  });

  it("hook command scripts referenced in hooks.codex.json exist on disk", () => {
    const hooks = readJson<{ hooks: Record<string, HookEntry[]> }>(
      join(pluginRoot, "hooks/hooks.codex.json"),
    );
    const scriptRefs = new Set<string>();
    for (const entries of Object.values(hooks.hooks)) {
      for (const entry of entries) {
        for (const handler of entry.hooks) {
          const match = handler.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/(scripts\/[^\s"]+)/);
          if (match) scriptRefs.add(match[1]);
        }
      }
    }
    expect(scriptRefs.size).toBeGreaterThan(0);
    for (const rel of scriptRefs) {
      expect(existsSync(join(pluginRoot, rel)), `missing hook script: ${rel}`).toBe(true);
    }
  });
});

describe("Codex marketplace.json (.codex-plugin/marketplace.json at repo root)", () => {
  it("ships a marketplace manifest pointing at the plugin/ subdirectory", () => {
    const marketplacePath = join(repoRoot, ".codex-plugin/marketplace.json");
    expect(existsSync(marketplacePath)).toBe(true);
    const marketplace = readJson<{
      name: string;
      plugins: Array<{
        name: string;
        source: { source: string; url: string; path: string; ref?: string };
      }>;
    }>(marketplacePath);
    expect(marketplace.name).toBe("agentmemory");
    expect(marketplace.plugins).toHaveLength(1);
    const entry = marketplace.plugins[0];
    expect(entry.name).toBe("agentmemory");
    expect(entry.source.source).toBe("git-subdir");
    expect(entry.source.path).toBe("./plugin");
    expect(entry.source.url).toMatch(/rohitg00\/agentmemory/);
  });
});
