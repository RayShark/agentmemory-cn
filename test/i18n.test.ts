import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { languageInstruction, resolveLocale, t } from "../src/i18n/index.js";

const ORIGINAL_ENV = {
  HOME: process.env["HOME"],
  USERPROFILE: process.env["USERPROFILE"],
  AGENTMEMORY_LOCALE: process.env["AGENTMEMORY_LOCALE"],
  VIEWER_LANGUAGE: process.env["VIEWER_LANGUAGE"],
};

let sandboxHome: string;

async function freshConfig() {
  vi.resetModules();
  return await import("../src/config.js");
}

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function writeAgentMemoryEnv(contents: string) {
  const dir = join(sandboxHome, ".agentmemory");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".env"), contents);
}

describe("i18n locale resolution", () => {
  beforeEach(() => {
    sandboxHome = mkdtempSync(join(tmpdir(), "agentmemory-i18n-"));
    restoreEnv();
    process.env["HOME"] = sandboxHome;
    process.env["USERPROFILE"] = sandboxHome;
    delete process.env["AGENTMEMORY_LOCALE"];
    delete process.env["VIEWER_LANGUAGE"];
  });

  afterEach(() => {
    restoreEnv();
    rmSync(sandboxHome, { recursive: true, force: true });
  });

  it("defaults to English", async () => {
    expect(resolveLocale()).toBe("en");
    const cfg = await freshConfig();
    expect(cfg.getLocale()).toBe("en");
  });

  it.each(["zh", "zh-CN", "zh_CN", "zh-cn"])(
    "normalizes %s to zh-CN",
    (raw) => {
      expect(resolveLocale(raw)).toBe("zh-CN");
    },
  );

  it("falls back to English for unsupported locale values", () => {
    expect(resolveLocale("de")).toBe("en");
    expect(resolveLocale("")).toBe("en");
    expect(resolveLocale("../../../zh-CN")).toBe("en");
  });

  it("uses AGENTMEMORY_LOCALE before legacy VIEWER_LANGUAGE", async () => {
    process.env["AGENTMEMORY_LOCALE"] = "zh_CN";
    process.env["VIEWER_LANGUAGE"] = "en";
    const cfg = await freshConfig();
    expect(cfg.getLocale()).toBe("zh-CN");
  });

  it("uses legacy VIEWER_LANGUAGE when AGENTMEMORY_LOCALE is absent", async () => {
    process.env["VIEWER_LANGUAGE"] = "zh";
    const cfg = await freshConfig();
    expect(cfg.getLocale()).toBe("zh-CN");
  });

  it("reads locale from the agentmemory env file", async () => {
    writeAgentMemoryEnv("AGENTMEMORY_LOCALE=zh-CN");
    const cfg = await freshConfig();
    expect(cfg.getLocale()).toBe("zh-CN");
  });
});

describe("i18n messages", () => {
  it("falls back to English when a key is missing in the selected locale", () => {
    expect(t("zh-CN", "test.englishOnly")).toBe("English fallback");
  });

  it("returns the key when no locale has the message", () => {
    expect(t("zh-CN", "missing.key")).toBe("missing.key");
  });

  it("replaces parameters without treating values as markup", () => {
    expect(t("zh-CN", "test.greeting", { name: "</script><b>Ada</b>" })).toBe(
      "你好，</script><b>Ada</b>",
    );
  });

  it("provides a Chinese language instruction without translating schema tokens", () => {
    const instruction = languageInstruction("zh-CN");
    expect(instruction).toContain("简体中文");
    expect(instruction).toContain("XML/JSON");
    expect(instruction).toContain("enum");
  });

  it("does not add a language constraint for English", () => {
    expect(languageInstruction("en")).toBe("");
  });
});
