import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import zh from "../src/i18n/locales/zh-CN.json" with { type: "json" };

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flatten(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

describe("i18n source completeness", () => {
  it("zh-CN has every production message key from English", () => {
    const enKeys = flatten(en).filter((key) => !key.startsWith("test."));
    const zhKeys = new Set(flatten(zh));

    expect(enKeys.filter((key) => !zhKeys.has(key))).toEqual([]);
  });

  it("does not leave REST wrapper errors as string literals", () => {
    const source = readFileSync("src/triggers/api.ts", "utf-8");
    expect(source).not.toMatch(/body:\s*\{\s*error:\s*"/);
  });

  it("does not add direct English prompt/log literals in CLI entrypoints", () => {
    const files = [
      "src/cli.ts",
      "src/cli/onboarding.ts",
      "src/cli/connect/index.ts",
      "src/cli/connect/codex.ts",
      "src/cli/connect/claude-code.ts",
    ];
    const forbidden =
      /p\.(intro|outro|note|log\.(error|info|warn|success))\(\s*["'`](?:\[[^\]]+\]\s*)?(?:[A-Z]|agentmemory|iii|npm|curl)[A-Za-z ,.!?:;()/-]{8,}/;

    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      expect(source, file).not.toMatch(forbidden);
    }
  });
});
