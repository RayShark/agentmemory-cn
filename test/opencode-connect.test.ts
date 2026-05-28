import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConnectAdapter } from "../src/cli/connect/types.js";

const ORIGINAL_ENV = {
  HOME: process.env["HOME"],
  USERPROFILE: process.env["USERPROFILE"],
  XDG_CONFIG_HOME: process.env["XDG_CONFIG_HOME"],
};

describe("connect: OpenCode", () => {
  let home: string;
  let configHome: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-opencode-connect-"));
    configHome = join(home, ".config");
    process.env["HOME"] = home;
    process.env["USERPROFILE"] = home;
    process.env["XDG_CONFIG_HOME"] = configHome;
    vi.resetModules();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true });
    vi.resetModules();
  });

  async function loadAdapter(): Promise<ConnectAdapter> {
    const mod = await import("../src/cli/connect/opencode.js?t=" + Date.now());
    return (mod as { adapter: ConnectAdapter }).adapter;
  }

  function opencodeDir(): string {
    return join(configHome, "opencode");
  }

  function bundledCommand(
    localeDir: "commands" | "commands.zh-CN",
    name: string,
  ): string {
    return readFileSync(
      join(__dirname, "..", "plugin", "opencode", localeDir, name),
      "utf-8",
    );
  }

  it("does not detect when the OpenCode config directory is absent", async () => {
    const adapter = await loadAdapter();
    expect(adapter.detect()).toBe(false);
  });

  it("writes OpenCode MCP, plugin, and English slash commands by default", async () => {
    mkdirSync(opencodeDir(), { recursive: true });

    const adapter = await loadAdapter();
    const result = await adapter.install({
      dryRun: false,
      force: false,
      locale: "en",
    });

    expect(result.kind).toBe("installed");
    const config = JSON.parse(
      readFileSync(join(opencodeDir(), "opencode.json"), "utf-8"),
    );
    expect(config.mcp.agentmemory).toEqual({
      type: "local",
      command: ["npx", "-y", "@agentmemory/mcp"],
      enabled: true,
    });
    expect(config.plugin).toContain("./plugins/agentmemory-capture.ts");
    expect(
      readFileSync(join(opencodeDir(), "commands", "recall.md"), "utf-8"),
    ).toBe(bundledCommand("commands", "recall.md"));
  });

  it("selects zh-CN slash commands when locale is zh-CN", async () => {
    mkdirSync(opencodeDir(), { recursive: true });

    const adapter = await loadAdapter();
    const result = await adapter.install({
      dryRun: false,
      force: false,
      locale: "zh-CN",
    });

    expect(result.kind).toBe("installed");
    expect(
      readFileSync(join(opencodeDir(), "commands", "recall.md"), "utf-8"),
    ).toBe(bundledCommand("commands.zh-CN", "recall.md"));
    expect(
      readFileSync(join(opencodeDir(), "commands", "remember.md"), "utf-8"),
    ).toBe(bundledCommand("commands.zh-CN", "remember.md"));
  });

  it("does not write config, plugin, or commands during dry-run", async () => {
    mkdirSync(opencodeDir(), { recursive: true });

    const adapter = await loadAdapter();
    const result = await adapter.install({
      dryRun: true,
      force: false,
      locale: "zh-CN",
    });

    expect(result.kind).toBe("installed");
    expect(existsSync(join(opencodeDir(), "opencode.json"))).toBe(false);
    expect(existsSync(join(opencodeDir(), "plugins"))).toBe(false);
    expect(existsSync(join(opencodeDir(), "commands"))).toBe(false);
  });

  it("overwrites existing command assets only when forced", async () => {
    mkdirSync(join(opencodeDir(), "commands"), { recursive: true });
    writeFileSync(join(opencodeDir(), "commands", "recall.md"), "custom recall");

    const adapter = await loadAdapter();
    await adapter.install({ dryRun: false, force: false, locale: "zh-CN" });
    expect(
      readFileSync(join(opencodeDir(), "commands", "recall.md"), "utf-8"),
    ).toBe("custom recall");

    const forced = await adapter.install({
      dryRun: false,
      force: true,
      locale: "zh-CN",
    });
    expect(forced.kind).toBe("installed");
    expect(
      readFileSync(join(opencodeDir(), "commands", "recall.md"), "utf-8"),
    ).toBe(bundledCommand("commands.zh-CN", "recall.md"));
  });
});
