import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { registerContextFunction } from "../src/functions/context.js";
import { KV } from "../src/state/schema.js";
import type { Lesson, ProjectProfile } from "../src/types.js";

const ORIGINAL_LOCALE = process.env["AGENTMEMORY_LOCALE"];

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      if (!store.has(scope)) return [];
      return Array.from(store.get(scope)!.values()) as T[];
    },
  };
}

type ContextHandler = (data: {
  sessionId: string;
  project: string;
  budget?: number;
}) => Promise<{ context: string; blocks: number; tokens: number }>;

function wireContext(kv: ReturnType<typeof mockKV>) {
  let handler: ContextHandler | undefined;
  const sdk = {
    registerFunction: vi.fn((id: string, cb: ContextHandler) => {
      if (id === "mem::context") handler = cb;
    }),
  } as unknown as import("iii-sdk").ISdk;
  registerContextFunction(sdk, kv as never, 4000);
  if (!handler) throw new Error("mem::context not registered");
  return handler;
}

describe("mem::context i18n", () => {
  let kv: ReturnType<typeof mockKV>;
  let handler: ContextHandler;

  beforeEach(() => {
    process.env["AGENTMEMORY_LOCALE"] = "zh-CN";
    kv = mockKV();
    handler = wireContext(kv);
  });

  afterEach(() => {
    if (ORIGINAL_LOCALE === undefined) delete process.env["AGENTMEMORY_LOCALE"];
    else process.env["AGENTMEMORY_LOCALE"] = ORIGINAL_LOCALE;
  });

  it("localizes project profile and lessons headings while preserving XML tags", async () => {
    const project = "/tmp/agentmemory-i18n";
    const now = new Date().toISOString();
    const profile: ProjectProfile = {
      project,
      updatedAt: now,
      topConcepts: [{ concept: "locale", frequency: 4 }],
      topFiles: [{ file: "src/i18n/index.ts", frequency: 2 }],
      conventions: ["TypeScript 项目"],
      commonErrors: ["parse_failed"],
      recentActivity: [],
      sessionCount: 1,
      totalObservations: 3,
    };
    const lesson: Lesson = {
      id: "lesson_i18n",
      content: "保留 XML tag 英文",
      context: "",
      confidence: 0.9,
      reinforcements: 1,
      source: "manual",
      sourceIds: [],
      project,
      tags: [],
      createdAt: now,
      updatedAt: now,
      decayRate: 0.05,
    };

    await kv.set(KV.profiles, project, profile);
    await kv.set(KV.lessons, lesson.id, lesson);

    const result = await handler({ sessionId: "ses_current", project });

    expect(result.context).toContain("<agentmemory-context");
    expect(result.context).toContain("## 项目画像");
    expect(result.context).toContain("概念: locale");
    expect(result.context).toContain("关键文件: src/i18n/index.ts");
    expect(result.context).toContain("约定: TypeScript 项目");
    expect(result.context).toContain("常见错误: parse_failed");
    expect(result.context).toContain("## 经验");
    expect(result.context).toContain("保留 XML tag 英文");
  });
});
