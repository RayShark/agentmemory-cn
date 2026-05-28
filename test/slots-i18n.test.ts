import { describe, expect, it } from "vitest";
import type { ISdk } from "iii-sdk";
import type { MemorySlot } from "../src/types.js";
import { KV } from "../src/state/schema.js";
import { defaultSlots, registerSlotsFunctions } from "../src/functions/slots.js";

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
    list: async <T>(scope: string): Promise<T[]> => {
      if (!store.has(scope)) return [];
      return Array.from(store.get(scope)!.values()) as T[];
    },
  };
}

async function waitForSeed(kv: ReturnType<typeof mockKV>) {
  for (let i = 0; i < 20; i++) {
    const project = await kv.list<MemorySlot>(KV.slots);
    const global = await kv.list<MemorySlot>(KV.globalSlots);
    if (project.length + global.length >= defaultSlots("en").length) {
      return { project, global };
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return {
    project: await kv.list<MemorySlot>(KV.slots),
    global: await kv.list<MemorySlot>(KV.globalSlots),
  };
}

describe("slot i18n", () => {
  it("localizes default slot descriptions in zh-CN without translating labels", () => {
    const slots = defaultSlots("zh-CN");

    expect(slots.map((s) => s.label)).toContain("persona");
    expect(slots.find((s) => s.label === "persona")?.description).toMatch(
      /[\u3400-\u9fff]/,
    );
    expect(slots.map((s) => s.label)).toEqual(
      defaultSlots("en").map((s) => s.label),
    );
  });

  it("seeds default slot descriptions from AGENTMEMORY_LOCALE", async () => {
    const previous = process.env["AGENTMEMORY_LOCALE"];
    process.env["AGENTMEMORY_LOCALE"] = "zh-CN";
    try {
      const kv = mockKV();
      const sdk = {
        registerFunction: () => undefined,
      } as unknown as ISdk;

      registerSlotsFunctions(sdk, kv as never);

      const { global } = await waitForSeed(kv);
      const persona = global.find((slot) => slot.label === "persona");

      expect(persona?.label).toBe("persona");
      expect(persona?.description).toMatch(/[\u3400-\u9fff]/);
    } finally {
      if (previous === undefined) delete process.env["AGENTMEMORY_LOCALE"];
      else process.env["AGENTMEMORY_LOCALE"] = previous;
    }
  });
});
