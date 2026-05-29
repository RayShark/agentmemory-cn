import { describe, expect, it, vi } from "vitest";
import type { MemoryProvider, RawObservation } from "../src/types.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/functions/search.js", () => ({
  getSearchIndex: () => ({ add: vi.fn() }),
  vectorIndexAddGuarded: vi.fn().mockResolvedValue(false),
}));

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  const triggered: Array<{ id: string; payload: unknown }> = [];
  return {
    functions,
    triggered,
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    trigger: async (input: { function_id: string; payload: unknown }) => {
      triggered.push({ id: input.function_id, payload: input.payload });
      return {};
    },
  };
}

describe("mem::compress fallback", () => {
  it("stores a synthetic compressed observation when LLM XML parsing fails", async () => {
    const { registerCompressFunction } = await import("../src/functions/compress.js");
    const sdk = mockSdk();
    const kv = mockKV();
    const metrics = { record: vi.fn() };
    const provider: MemoryProvider = {
      name: "test",
      compress: async () => "<not-observation/>",
      summarize: async () => "",
    };
    const raw: RawObservation = {
      id: "obs_parse_fail",
      sessionId: "ses_parse_fail",
      timestamp: new Date().toISOString(),
      hookType: "post_tool_use",
      toolName: "Read",
      toolInput: { file_path: "src/foo.ts" },
      toolOutput: "file contents",
      raw: {},
    };

    registerCompressFunction(sdk as never, kv as never, provider, metrics as never);
    const handler = sdk.functions.get("mem::compress")!;
    const result = await handler({
      observationId: raw.id,
      sessionId: raw.sessionId,
      raw,
    });

    expect(result.success).toBe(true);
    expect(result.fallback).toBe("synthetic");
    const stored = await kv.get<Record<string, unknown>>(`mem:obs:${raw.sessionId}`, raw.id);
    expect(stored?.title).toBe("Read");
    expect(stored?.type).toBe("file_read");
    expect(stored?.confidence).toBe(0.3);
    expect(metrics.record).toHaveBeenCalledWith(
      "mem::compress",
      expect.any(Number),
      true,
      30,
    );
  }, 15_000);
});
