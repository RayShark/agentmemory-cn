import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { registerApiTriggers } from "../src/triggers/api.js";

const ORIGINAL_LOCALE = process.env["AGENTMEMORY_LOCALE"];

afterEach(() => {
  if (ORIGINAL_LOCALE === undefined) delete process.env["AGENTMEMORY_LOCALE"];
  else process.env["AGENTMEMORY_LOCALE"] = ORIGINAL_LOCALE;
});

describe("REST API i18n", () => {
  beforeEach(() => {
    process.env["AGENTMEMORY_LOCALE"] = "zh-CN";
  });

  it("localizes config flag labels and enable instructions", async () => {
    let flagsHandler:
      | ((req: { headers?: Record<string, string> }) => Promise<{ status_code: number; body: unknown }>)
      | undefined;
    const sdk = {
      registerFunction: vi.fn((id: string, cb: typeof flagsHandler) => {
        if (id === "api::config-flags") flagsHandler = cb;
      }),
      registerTrigger: vi.fn(),
    } as unknown as import("iii-sdk").ISdk;

    registerApiTriggers(sdk, {} as never);
    if (!flagsHandler) throw new Error("api::config-flags not registered");

    const response = await flagsHandler({});
    expect(response.status_code).toBe(200);
    const flags = (response.body as { flags: Array<{ key: string; label: string; enableHow: string }> }).flags;
    const graph = flags.find((flag) => flag.key === "GRAPH_EXTRACTION_ENABLED");
    expect(graph?.label).toBe("知识图谱抽取");
    expect(graph?.enableHow).toContain("设置 GRAPH_EXTRACTION_ENABLED=true");
    expect(graph?.key).toBe("GRAPH_EXTRACTION_ENABLED");
    expect((graph as { affects?: string[] } | undefined)?.affects).toEqual(["Graph", "Dashboard"]);
  });

  it("reports no embedding provider when embeddings are explicitly disabled", async () => {
    const originalEmbeddingProvider = process.env["EMBEDDING_PROVIDER"];
    const originalOpenAiKey = process.env["OPENAI_API_KEY"];
    process.env["EMBEDDING_PROVIDER"] = "none";
    process.env["OPENAI_API_KEY"] = "test-key";
    try {
      let flagsHandler:
        | ((req: { headers?: Record<string, string> }) => Promise<{ status_code: number; body: unknown }>)
        | undefined;
      const sdk = {
        registerFunction: vi.fn((id: string, cb: typeof flagsHandler) => {
          if (id === "api::config-flags") flagsHandler = cb;
        }),
        registerTrigger: vi.fn(),
      } as unknown as import("iii-sdk").ISdk;

      registerApiTriggers(sdk, {} as never);
      if (!flagsHandler) throw new Error("api::config-flags not registered");

      const response = await flagsHandler({});
      expect(response.status_code).toBe(200);
      expect((response.body as { embeddingProvider?: string }).embeddingProvider).toBe("none");
    } finally {
      if (originalEmbeddingProvider === undefined) delete process.env["EMBEDDING_PROVIDER"];
      else process.env["EMBEDDING_PROVIDER"] = originalEmbeddingProvider;
      if (originalOpenAiKey === undefined) delete process.env["OPENAI_API_KEY"];
      else process.env["OPENAI_API_KEY"] = originalOpenAiKey;
    }
  });

  it("localizes high-frequency validation errors without changing status codes", async () => {
    let searchHandler:
      | ((req: { body?: Record<string, unknown>; headers?: Record<string, string> }) => Promise<{ status_code: number; body: unknown }>)
      | undefined;
    const sdk = {
      registerFunction: vi.fn((id: string, cb: typeof searchHandler) => {
        if (id === "api::search") searchHandler = cb;
      }),
      registerTrigger: vi.fn(),
      trigger: vi.fn(),
    } as unknown as import("iii-sdk").ISdk;

    registerApiTriggers(sdk, {} as never);
    if (!searchHandler) throw new Error("api::search not registered");

    const response = await searchHandler({ body: {} });
    expect(response.status_code).toBe(400);
    expect(response.body).toEqual({
      error: "query 为必填项，且必须是非空字符串",
    });
  });

  it("localizes feature-disabled responses while preserving machine fields", async () => {
    let graphStatsHandler:
      | ((req: { headers?: Record<string, string> }) => Promise<{ status_code: number; body: unknown }>)
      | undefined;
    const sdk = {
      registerFunction: vi.fn((id: string, cb: typeof graphStatsHandler) => {
        if (id === "api::graph-stats") graphStatsHandler = cb;
      }),
      registerTrigger: vi.fn(),
      trigger: vi.fn(async () => {
        throw new Error("disabled");
      }),
    } as unknown as import("iii-sdk").ISdk;

    registerApiTriggers(sdk, {} as never);
    if (!graphStatsHandler) throw new Error("api::graph-stats not registered");

    const response = await graphStatsHandler({});
    expect(response.status_code).toBe(503);
    expect(response.body).toMatchObject({
      error: "知识图谱未启用",
      flag: "GRAPH_EXTRACTION_ENABLED",
    });
    expect((response.body as { enableHow: string }).enableHow).toContain(
      "GRAPH_EXTRACTION_ENABLED=true",
    );
  });

  it("localizes compress-file missing filePath errors", async () => {
    let compressFileHandler:
      | ((req: { body?: Record<string, unknown>; headers?: Record<string, string> }) => Promise<{ status_code: number; body: unknown }>)
      | undefined;
    const sdk = {
      registerFunction: vi.fn((id: string, cb: typeof compressFileHandler) => {
        if (id === "api::compress-file") compressFileHandler = cb;
      }),
      registerTrigger: vi.fn(),
      trigger: vi.fn(),
    } as unknown as import("iii-sdk").ISdk;

    registerApiTriggers(sdk, {} as never);
    if (!compressFileHandler) throw new Error("api::compress-file not registered");

    const response = await compressFileHandler({ body: {} });
    expect(response.status_code).toBe(400);
    expect(response.body).toEqual({
      error: "filePath 必须是非空字符串",
    });
  });

  it("localizes Claude bridge disabled errors", async () => {
    let claudeBridgeHandler:
      | ((req: { headers?: Record<string, string> }) => Promise<{ status_code: number; body: unknown }>)
      | undefined;
    const sdk = {
      registerFunction: vi.fn((id: string, cb: typeof claudeBridgeHandler) => {
        if (id === "api::claude-bridge-read") claudeBridgeHandler = cb;
      }),
      registerTrigger: vi.fn(),
      trigger: vi.fn(async () => {
        throw new Error("disabled");
      }),
    } as unknown as import("iii-sdk").ISdk;

    registerApiTriggers(sdk, {} as never);
    if (!claudeBridgeHandler) throw new Error("api::claude-bridge-read not registered");

    const response = await claudeBridgeHandler({});
    expect(response.status_code).toBe(404);
    expect(response.body).toEqual({
      error: "Claude bridge 未启用",
    });
  });

  it("localizes numeric parameter errors", async () => {
    let crystalListHandler:
      | ((req: { query_params?: Record<string, string>; headers?: Record<string, string> }) => Promise<{ status_code: number; body: unknown }>)
      | undefined;
    const sdk = {
      registerFunction: vi.fn((id: string, cb: typeof crystalListHandler) => {
        if (id === "api::crystal-list") crystalListHandler = cb;
      }),
      registerTrigger: vi.fn(),
      trigger: vi.fn(),
    } as unknown as import("iii-sdk").ISdk;

    registerApiTriggers(sdk, {} as never);
    if (!crystalListHandler) throw new Error("api::crystal-list not registered");

    const response = await crystalListHandler({ query_params: { limit: "many" } });
    expect(response.status_code).toBe(400);
    expect(response.body).toEqual({
      error: "无效数字参数：limit",
    });
  });
});
