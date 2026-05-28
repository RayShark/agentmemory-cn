import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { t } from "../src/i18n/index.js";

const prompts = vi.hoisted(() => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  multiselect: vi.fn(),
  isCancel: vi.fn(() => false),
  note: vi.fn(),
  log: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
    step: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@clack/prompts", () => prompts);

import {
  ADAPTERS,
  knownAgents,
  resolveAdapter,
  runAdapter,
  runConnect,
} from "../src/cli/connect/index.js";
import type { ConnectAdapter } from "../src/cli/connect/types.js";

describe("agentmemory connect — dispatcher", () => {
  it("resolves every known agent by lowercase name", () => {
    for (const name of knownAgents()) {
      const a = resolveAdapter(name);
      expect(a, `expected adapter for ${name}`).not.toBeNull();
      expect(a!.name).toBe(name);
    }
  });

  it("resolves case-insensitively", () => {
    expect(resolveAdapter("Claude-Code")?.name).toBe("claude-code");
    expect(resolveAdapter("CURSOR")?.name).toBe("cursor");
    expect(resolveAdapter("OpenCode")?.name).toBe("opencode");
  });

  it("returns null for unknown agents", () => {
    expect(resolveAdapter("nonexistent-agent")).toBeNull();
    expect(resolveAdapter("")).toBeNull();
  });

  it("ships the supported agent list", () => {
    // Bumped to 12 after adding OpenCode.
    expect(knownAgents().sort()).toEqual(
      [
        "antigravity",
        "claude-code",
        "codex",
        "cursor",
        "gemini-cli",
        "hermes",
        "kiro",
        "opencode",
        "openclaw",
        "openhuman",
        "pi",
        "qwen",
      ].sort(),
    );
    expect(ADAPTERS.length).toBe(12);
  });

  it("every adapter exposes detect() and install()", () => {
    for (const a of ADAPTERS) {
      expect(typeof a.detect).toBe("function");
      expect(typeof a.install).toBe("function");
      expect(typeof a.name).toBe("string");
      expect(typeof a.displayName).toBe("string");
    }
  });

  it("connect catalog preserves supported agent names while localizing labels", () => {
    expect(t("zh-CN", "cli.connect.noneDetected")).toMatch(/[\u3400-\u9fff]/);
    expect(
      t("zh-CN", "cli.connect.supported", { agents: "codex, opencode" }),
    ).toContain("codex, opencode");
  });

  it("runAdapter localizes not-detected messages while preserving docs URLs", async () => {
    const result = await runAdapter(
      {
        name: "codex",
        displayName: "Codex",
        docs: "https://example.com/codex",
        detect: () => false,
        install: async () => ({ kind: "installed" }),
      },
      { dryRun: false, force: false, locale: "zh-CN" },
    );

    expect(result).toEqual({ kind: "skipped", reason: "not-detected" });
    expect(prompts.log.warn).toHaveBeenCalledWith(
      expect.stringMatching(/[\u3400-\u9fff]/),
    );
    expect(prompts.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("https://example.com/codex"),
    );
    expect(prompts.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("Codex"),
    );
  });
});

describe("agentmemory connect — localized run output", () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalUserprofile: string | undefined;
  let originalConfigHome: string | undefined;
  let originalLocale: string | undefined;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "am-connect-i18n-"));
    originalHome = process.env["HOME"];
    originalUserprofile = process.env["USERPROFILE"];
    originalConfigHome = process.env["XDG_CONFIG_HOME"];
    originalLocale = process.env["AGENTMEMORY_LOCALE"];
    process.env["HOME"] = tmpHome;
    process.env["USERPROFILE"] = tmpHome;
    process.env["XDG_CONFIG_HOME"] = join(tmpHome, ".config");
    process.env["AGENTMEMORY_LOCALE"] = "zh-CN";
    mkdirSync(join(process.env["XDG_CONFIG_HOME"], "opencode"), {
      recursive: true,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    else delete process.env["HOME"];
    if (originalUserprofile !== undefined)
      process.env["USERPROFILE"] = originalUserprofile;
    else delete process.env["USERPROFILE"];
    if (originalConfigHome !== undefined)
      process.env["XDG_CONFIG_HOME"] = originalConfigHome;
    else delete process.env["XDG_CONFIG_HOME"];
    if (originalLocale !== undefined)
      process.env["AGENTMEMORY_LOCALE"] = originalLocale;
    else delete process.env["AGENTMEMORY_LOCALE"];
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it("localizes the run summary while preserving the agent name", async () => {
    await runConnect(["opencode", "--dry-run"]);

    expect(prompts.intro).toHaveBeenCalledWith(
      expect.stringMatching(/[\u3400-\u9fff]/),
    );
    expect(prompts.note).toHaveBeenCalledWith(
      expect.stringContaining("opencode"),
      expect.stringMatching(/[\u3400-\u9fff]/),
    );
    expect(prompts.note).toHaveBeenCalledWith(
      expect.stringMatching(/[\u3400-\u9fff]/),
      expect.any(String),
    );
    expect(prompts.outro).toHaveBeenCalledWith(
      expect.stringMatching(/[\u3400-\u9fff]/),
    );
  });
});

describe("agentmemory connect — claude-code adapter (mock filesystem)", () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalUserprofile: string | undefined;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "am-connect-"));
    originalHome = process.env["HOME"];
    originalUserprofile = process.env["USERPROFILE"];
    process.env["HOME"] = tmpHome;
    process.env["USERPROFILE"] = tmpHome;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    else delete process.env["HOME"];
    if (originalUserprofile !== undefined)
      process.env["USERPROFILE"] = originalUserprofile;
    else delete process.env["USERPROFILE"];
    rmSync(tmpHome, { recursive: true, force: true });
    vi.resetModules();
  });

  async function loadAdapter(): Promise<ConnectAdapter> {
    const mod = await import("../src/cli/connect/claude-code.js?t=" + Date.now());
    return (mod as { adapter: ConnectAdapter }).adapter;
  }

  it("detect() returns false when ~/.claude doesn't exist", async () => {
    const a = await loadAdapter();
    expect(a.detect()).toBe(false);
  });

  it("install() writes mcpServers.agentmemory into ~/.claude.json and is idempotent", async () => {
    const claudeDir = join(tmpHome, ".claude");
    require("node:fs").mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(tmpHome, ".claude.json"),
      JSON.stringify({ mcpServers: { other: { command: "x" } } }),
    );

    const a = await loadAdapter();
    expect(a.detect()).toBe(true);

    const first = await a.install({ dryRun: false, force: false });
    expect(first.kind).toBe("installed");

    const config = JSON.parse(readFileSync(join(tmpHome, ".claude.json"), "utf-8"));
    expect(config.mcpServers.agentmemory.command).toBe("npx");
    expect(config.mcpServers.agentmemory.args).toContain("@agentmemory/mcp");
    expect(config.mcpServers.other.command).toBe("x");

    const second = await a.install({ dryRun: false, force: false });
    expect(second.kind).toBe("already-wired");
  });

  it("install() writes env passthrough block for AGENTMEMORY_URL + AGENTMEMORY_SECRET (#375)", async () => {
    // Remote deployments (k8s, reverse proxy) set AGENTMEMORY_URL +
    // AGENTMEMORY_SECRET in the shell. The wired MCP entry must honour
    // those via ${VAR} expansion so a single entry covers both local
    // and remote without the user needing to add a duplicate config
    // that triggers a /doctor duplicate-server warning.
    const claudeDir = join(tmpHome, ".claude");
    require("node:fs").mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(tmpHome, ".claude.json"), JSON.stringify({}));

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");

    const config = JSON.parse(readFileSync(join(tmpHome, ".claude.json"), "utf-8"));
    const entry = config.mcpServers.agentmemory;
    expect(entry.env).toBeDefined();
    // env interpolation must carry a default so Claude Code
    // doesn't silently drop the server when the user hasn't exported
    // AGENTMEMORY_URL / AGENTMEMORY_SECRET. Defaults match the
    // documented runtime (localhost:3111, no auth, all tools).
    expect(entry.env.AGENTMEMORY_URL).toBe(
      "${AGENTMEMORY_URL:-http://localhost:3111}",
    );
    expect(entry.env.AGENTMEMORY_SECRET).toBe("${AGENTMEMORY_SECRET:-}");
    expect(entry.env.AGENTMEMORY_TOOLS).toBe("${AGENTMEMORY_TOOLS:-all}");
  });

  it("install() with --force re-writes even when already wired", async () => {
    require("node:fs").mkdirSync(join(tmpHome, ".claude"), { recursive: true });
    writeFileSync(
      join(tmpHome, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          agentmemory: { command: "npx", args: ["-y", "@agentmemory/mcp"] },
        },
      }),
    );

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: true });
    expect(result.kind).toBe("installed");
  });

  it("install() with --dry-run does not mutate the file", async () => {
    require("node:fs").mkdirSync(join(tmpHome, ".claude"), { recursive: true });
    const before = JSON.stringify({ mcpServers: {} });
    writeFileSync(join(tmpHome, ".claude.json"), before);

    const a = await loadAdapter();
    const result = await a.install({ dryRun: true, force: false });
    expect(result.kind).toBe("installed");

    const after = readFileSync(join(tmpHome, ".claude.json"), "utf-8");
    expect(after).toBe(before);
  });

  it("install() creates a backup file under ~/.agentmemory/backups/", async () => {
    require("node:fs").mkdirSync(join(tmpHome, ".claude"), { recursive: true });
    writeFileSync(
      join(tmpHome, ".claude.json"),
      JSON.stringify({ mcpServers: {} }),
    );

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    if (result.kind === "installed") {
      expect(result.backupPath).toBeDefined();
      expect(existsSync(result.backupPath!)).toBe(true);
      expect(result.backupPath!).toContain(".agentmemory/backups");
    }
  });
});

describe("agentmemory connect — locale-aware plugin manifests (mock filesystem)", () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalUserprofile: string | undefined;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "am-connect-plugin-i18n-"));
    originalHome = process.env["HOME"];
    originalUserprofile = process.env["USERPROFILE"];
    process.env["HOME"] = tmpHome;
    process.env["USERPROFILE"] = tmpHome;
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    else delete process.env["HOME"];
    if (originalUserprofile !== undefined)
      process.env["USERPROFILE"] = originalUserprofile;
    else delete process.env["USERPROFILE"];
    rmSync(tmpHome, { recursive: true, force: true });
    vi.resetModules();
  });

  it("Codex zh-CN install stages and logs the zh-CN plugin manifest", async () => {
    mkdirSync(join(tmpHome, ".codex"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/codex.js?t=" + Date.now());

    const result = await adapter.install({
      dryRun: false,
      force: false,
      locale: "zh-CN",
    });
    const manifestPath = join(
      tmpHome,
      ".agentmemory",
      "plugins",
      "agentmemory.zh-CN",
      ".codex-plugin",
      "plugin.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

    expect(result.kind).toBe("installed");
    expect(manifest.skills).toBe("./skills.zh-CN/");
    expect(prompts.log.info).toHaveBeenCalledWith(
      expect.stringContaining(manifestPath),
    );
  });

  it("Claude Code zh-CN install stages and logs the zh-CN plugin manifest", async () => {
    mkdirSync(join(tmpHome, ".claude"), { recursive: true });
    const { adapter } = await import(
      "../src/cli/connect/claude-code.js?t=" + Date.now()
    );

    const result = await adapter.install({
      dryRun: false,
      force: false,
      locale: "zh-CN",
    });
    const manifestPath = join(
      tmpHome,
      ".agentmemory",
      "plugins",
      "agentmemory.zh-CN",
      ".claude-plugin",
      "plugin.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

    expect(result.kind).toBe("installed");
    expect(manifest.skills).toEqual(["./skills.zh-CN/"]);
    expect(prompts.log.info).toHaveBeenCalledWith(
      expect.stringContaining(manifestPath),
    );
  });
});

describe("agentmemory connect — stub adapters log + return stub", () => {
  it("hermes adapter returns stub regardless of detect", async () => {
    const { adapter } = await import("../src/cli/connect/hermes.js");
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("stub");
  });

  it("openhuman adapter returns stub", async () => {
    const { adapter } = await import("../src/cli/connect/openhuman.js");
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("stub");
  });

  it("pi adapter returns stub", async () => {
    const { adapter } = await import("../src/cli/connect/pi.js");
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("stub");
  });
});
