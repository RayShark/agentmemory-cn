import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerExportImportFunction } from "../src/functions/export-import.js";
import type {
  Session,
  CompressedObservation,
  Memory,
  SessionSummary,
  ExportData,
} from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  const calls: Array<{ op: string; scope: string; key?: string }> = [];
  const kv = {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      calls.push({ op: "get", scope, key });
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      calls.push({ op: "set", scope, key });
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      calls.push({ op: "delete", scope, key });
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      calls.push({ op: "list", scope });
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
    calls,
  };
  return kv;
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

const testSession: Session = {
  id: "ses_1",
  project: "my-project",
  cwd: "/tmp",
  startedAt: "2026-02-01T00:00:00Z",
  status: "completed",
  observationCount: 1,
};

const testObs: CompressedObservation = {
  id: "obs_1",
  sessionId: "ses_1",
  timestamp: "2026-02-01T10:00:00Z",
  type: "file_edit",
  title: "Edit auth",
  facts: ["Added check"],
  narrative: "Auth changes",
  concepts: ["auth"],
  files: ["src/auth.ts"],
  importance: 7,
};

const testMemory: Memory = {
  id: "mem_1",
  createdAt: "2026-02-01T00:00:00Z",
  updatedAt: "2026-02-01T00:00:00Z",
  type: "pattern",
  title: "Auth pattern",
  content: "Always validate tokens",
  concepts: ["auth"],
  files: [],
  sessionIds: ["ses_1"],
  strength: 5,
  version: 1,
  isLatest: true,
};

const testSummary: SessionSummary = {
  sessionId: "ses_1",
  project: "my-project",
  createdAt: "2026-02-01T00:00:00Z",
  title: "Auth work",
  narrative: "Worked on auth",
  keyDecisions: ["Use JWT"],
  filesModified: ["src/auth.ts"],
  concepts: ["auth"],
  observationCount: 1,
};

const otherSession: Session = {
  ...testSession,
  id: "ses_2",
  project: "other-project",
  observationCount: 1,
};

const otherObs: CompressedObservation = {
  ...testObs,
  id: "obs_2",
  sessionId: "ses_2",
  title: "Other edit",
};

const otherMemory: Memory = {
  ...testMemory,
  id: "mem_2",
  title: "Other pattern",
  sessionIds: ["ses_2"],
  sourceObservationIds: ["obs_2"],
};

const unrelatedMemory: Memory = {
  ...testMemory,
  id: "mem_3",
  title: "Unrelated pattern",
  sessionIds: ["ses_missing"],
  sourceObservationIds: ["obs_missing"],
};

const otherSummary: SessionSummary = {
  ...testSummary,
  sessionId: "ses_2",
  project: "other-project",
  title: "Other work",
};

describe("Export/Import Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);

    await kv.set("mem:sessions", "ses_1", testSession);
    await kv.set("mem:obs:ses_1", "obs_1", testObs);
    await kv.set("mem:memories", "mem_1", testMemory);
    await kv.set("mem:summaries", "ses_1", testSummary);
  });

  it("export produces valid ExportData structure", async () => {
    const result = (await sdk.trigger("mem::export", {})) as ExportData;

    expect(result.version).toBe("1.0.0");
    expect(result.exportedAt).toBeDefined();
    expect(result.sessions.length).toBe(1);
    expect(result.sessions[0].id).toBe("ses_1");
    expect(result.observations["ses_1"].length).toBe(1);
    expect(result.memories.length).toBe(1);
    expect(result.summaries.length).toBe(1);
  });

  it("import with merge strategy adds data", async () => {
    const exportData: ExportData = {
      version: "0.3.0",
      exportedAt: new Date().toISOString(),
      sessions: [{ ...testSession, id: "ses_2", observationCount: 0 }],
      observations: {},
      memories: [{ ...testMemory, id: "mem_2", title: "New pattern" }],
      summaries: [],
    };

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "merge",
    })) as { success: boolean; sessions: number; memories: number };

    expect(result.success).toBe(true);
    expect(result.sessions).toBe(1);
    expect(result.memories).toBe(1);

    const allSessions = await kv.list("mem:sessions");
    expect(allSessions.length).toBe(2);
  });

  it("import with skip strategy does not overwrite existing", async () => {
    const exportData: ExportData = {
      version: "0.3.0",
      exportedAt: new Date().toISOString(),
      sessions: [testSession],
      observations: { ses_1: [testObs] },
      memories: [testMemory],
      summaries: [testSummary],
    };

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "skip",
    })) as { success: boolean; skipped: number; sessions: number };

    expect(result.success).toBe(true);
    expect(result.skipped).toBeGreaterThan(0);
    expect(result.sessions).toBe(0);
  });

  it("import with replace strategy clears existing data first", async () => {
    const newSession: Session = {
      id: "ses_new",
      project: "new-project",
      cwd: "/tmp/new",
      startedAt: "2026-03-01T00:00:00Z",
      status: "active",
      observationCount: 0,
    };
    const exportData: ExportData = {
      version: "0.3.0",
      exportedAt: new Date().toISOString(),
      sessions: [newSession],
      observations: {},
      memories: [],
      summaries: [],
    };

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "replace",
    })) as { success: boolean; sessions: number };

    expect(result.success).toBe(true);
    expect(result.sessions).toBe(1);

    const oldSession = await kv.get("mem:sessions", "ses_1");
    expect(oldSession).toBeNull();
  });

  it("export then import round-trip preserves data", async () => {
    const exported = (await sdk.trigger("mem::export", {})) as ExportData;

    const freshKv = mockKV();
    const freshSdk = mockSdk();
    registerExportImportFunction(freshSdk as never, freshKv as never);

    const importResult = (await freshSdk.trigger("mem::import", {
      exportData: exported,
      strategy: "merge",
    })) as {
      success: boolean;
      sessions: number;
      observations: number;
      memories: number;
    };

    expect(importResult.success).toBe(true);
    expect(importResult.sessions).toBe(1);
    expect(importResult.observations).toBe(1);
    expect(importResult.memories).toBe(1);

    const reExported = (await freshSdk.trigger(
      "mem::export",
      {},
    )) as ExportData;
    expect(reExported.sessions.length).toBe(exported.sessions.length);
    expect(reExported.memories.length).toBe(exported.memories.length);
  });

  it("import rejects unsupported version", async () => {
    const exportData = {
      version: "9.9.9",
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
    } as unknown as ExportData;

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "merge",
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported export version");
  });

  it("scopes paginated export to the selected session page", async () => {
    await kv.set("mem:sessions", "ses_2", otherSession);
    await kv.set("mem:obs:ses_2", "obs_2", otherObs);
    await kv.set("mem:memories", "mem_2", otherMemory);
    await kv.set("mem:memories", "mem_3", unrelatedMemory);
    await kv.set("mem:summaries", "ses_2", otherSummary);
    await kv.set("mem:graph:nodes", "node_1", {
      id: "node_1",
      type: "concept",
      name: "large-global-scope",
      properties: {},
      sourceObservationIds: ["obs_2"],
      createdAt: "2026-02-01T00:00:00Z",
    });
    await kv.set("mem:access", "mem_1", {
      memoryId: "mem_1",
      count: 1,
      lastAt: "2026-02-01T00:00:00Z",
      recent: [1],
    });
    await kv.set("mem:access", "mem_2", {
      memoryId: "mem_2",
      count: 1,
      lastAt: "2026-02-01T00:00:00Z",
      recent: [1],
    });

    const result = (await sdk.trigger("mem::export", {
      maxSessions: 1,
      offset: 0,
    })) as ExportData;

    expect(result.pagination).toMatchObject({
      offset: 0,
      limit: 1,
      total: 2,
      hasMore: true,
    });
    expect(result.sessions.map((s) => s.id)).toEqual(["ses_1"]);
    expect(Object.keys(result.observations)).toEqual(["ses_1"]);
    expect(result.summaries.map((s) => s.sessionId)).toEqual(["ses_1"]);
    expect(result.memories).toEqual([]);
    expect(result.accessLogs).toBeUndefined();
    expect(result.graphNodes).toBeUndefined();
  });

  it("paginated export skips malformed session keys", async () => {
    await kv.set("mem:sessions", "bad", {
      project: undefined,
      cwd: undefined,
      startedAt: "2026-02-01T00:00:00Z",
      status: "completed",
      observationCount: 0,
    });

    const result = (await sdk.trigger("mem::export", {
      maxSessions: 10,
    })) as ExportData;

    expect(result.sessions.map((s) => s.id)).toEqual(["ses_1"]);
    expect(result.pagination?.total).toBe(2);
    expect(
      kv.calls.some((call) => call.op === "get" && call.key === undefined),
    ).toBe(false);
  });

  it("full paginated export can opt into global scopes", async () => {
    await kv.set("mem:sessions", "ses_2", otherSession);
    await kv.set("mem:memories", "mem_2", otherMemory);
    await kv.set("mem:summaries", "ses_2", otherSummary);
    await kv.set("mem:graph:nodes", "node_1", {
      id: "node_1",
      type: "concept",
      name: "global-scope",
      properties: {},
      sourceObservationIds: [],
      createdAt: "2026-02-01T00:00:00Z",
    });

    const result = (await sdk.trigger("mem::export", {
      maxSessions: 1,
      includeGlobal: true,
    })) as ExportData;

    expect(result.sessions.map((s) => s.id)).toEqual(["ses_1"]);
    expect(result.memories.map((m) => m.id).sort()).toEqual(["mem_1", "mem_2"]);
    expect(result.summaries.map((s) => s.sessionId).sort()).toEqual([
      "ses_1",
      "ses_2",
    ]);
    expect(result.graphNodes?.map((n) => n.id)).toEqual(["node_1"]);
  });
});
