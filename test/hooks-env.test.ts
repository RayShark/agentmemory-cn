import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

function replaceEnv(next: Record<string, string>): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, next);
}

describe("hook environment loading", () => {
  it("loads AGENTMEMORY_URL and AGENTMEMORY_SECRET from ~/.agentmemory/.env", async () => {
    const home = join(tmpdir(), `agentmemory-hook-env-${process.pid}-${Date.now()}`);
    mkdirSync(join(home, ".agentmemory"), { recursive: true });
    writeFileSync(
      join(home, ".agentmemory", ".env"),
      "AGENTMEMORY_URL=http://127.0.0.1:3999\nAGENTMEMORY_SECRET=hook-secret\n",
      "utf-8",
    );
    replaceEnv({ HOME: home });

    const { loadHookEnv } = await import("../src/hooks/env.js");
    loadHookEnv();

    expect(process.env["AGENTMEMORY_URL"]).toBe("http://127.0.0.1:3999");
    expect(process.env["AGENTMEMORY_SECRET"]).toBe("hook-secret");

    rmSync(home, { recursive: true, force: true });
  });

  it("does not overwrite explicit hook environment values", async () => {
    const home = join(tmpdir(), `agentmemory-hook-env-existing-${process.pid}-${Date.now()}`);
    mkdirSync(join(home, ".agentmemory"), { recursive: true });
    writeFileSync(
      join(home, ".agentmemory", ".env"),
      "AGENTMEMORY_URL=http://127.0.0.1:3999\nAGENTMEMORY_SECRET=file-secret\n",
      "utf-8",
    );
    replaceEnv({
      HOME: home,
      AGENTMEMORY_SECRET: "explicit-secret",
    });

    const { loadHookEnv } = await import("../src/hooks/env.js");
    loadHookEnv();

    expect(process.env["AGENTMEMORY_URL"]).toBe("http://127.0.0.1:3999");
    expect(process.env["AGENTMEMORY_SECRET"]).toBe("explicit-secret");

    rmSync(home, { recursive: true, force: true });
  });

  it("can be disabled for hosts that inject a complete environment", async () => {
    const home = join(tmpdir(), `agentmemory-hook-env-disabled-${process.pid}-${Date.now()}`);
    mkdirSync(join(home, ".agentmemory"), { recursive: true });
    writeFileSync(
      join(home, ".agentmemory", ".env"),
      "AGENTMEMORY_SECRET=file-secret\n",
      "utf-8",
    );
    replaceEnv({
      HOME: home,
      AGENTMEMORY_LOAD_ENV: "false",
    });

    const { loadHookEnv } = await import("../src/hooks/env.js");
    loadHookEnv();

    expect(process.env["AGENTMEMORY_SECRET"]).toBeUndefined();

    rmSync(home, { recursive: true, force: true });
  });
});
