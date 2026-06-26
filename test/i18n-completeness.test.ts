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

function getString(obj: Record<string, unknown>, path: string): string {
  const value = path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, obj);
  expect(typeof value, path).toBe("string");
  return value as string;
}

describe("i18n source completeness", () => {
  it("zh-CN has every production message key from English", () => {
    const enKeys = flatten(en).filter((key) => !key.startsWith("test."));
    const zhKeys = new Set(flatten(zh));

    expect(enKeys.filter((key) => !zhKeys.has(key))).toEqual([]);
  });

  it("uses Chinese labels for high-visibility zh-CN runtime text", () => {
    const expected = new Map([
      ["promptInput.hook", "钩子"],
      ["promptInput.tool", "工具"],
      ["cli.status.viewer", "查看器"],
      ["cli.status.embeddings", "嵌入"],
      ["cli.demo.viewer", "查看器"],
      ["cli.diagnostics.viewerUnreachable.message", "查看器端口不可达。"],
      ["cli.engine.binary", "二进制文件: {{path}}"],
      ["cli.engine.stderrTitle", "引擎标准错误"],
      ["cli.importJsonl.emptyResponseBody", "空响应正文"],
      ["cli.importJsonl.viewReplay", "在 {{url}} 查看 -> 回放标签页"],
    ]);

    for (const [path, value] of expected) {
      expect(getString(zh, path)).toBe(value);
    }
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
