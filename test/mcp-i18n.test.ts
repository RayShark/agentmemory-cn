import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getAllTools } from "../src/mcp/tools-registry.js";
import { registerMcpEndpoints } from "../src/mcp/server.js";

const ORIGINAL_LOCALE = process.env["AGENTMEMORY_LOCALE"];

afterEach(() => {
  if (ORIGINAL_LOCALE === undefined) delete process.env["AGENTMEMORY_LOCALE"];
  else process.env["AGENTMEMORY_LOCALE"] = ORIGINAL_LOCALE;
});

describe("MCP i18n", () => {
  beforeEach(() => {
    process.env["AGENTMEMORY_LOCALE"] = "zh-CN";
  });

  it("localizes descriptions while preserving tool names and schema keys", () => {
    const enSave = getAllTools("en").find((tool) => tool.name === "memory_save");
    const zhSave = getAllTools("zh-CN").find((tool) => tool.name === "memory_save");
    expect(enSave).toBeDefined();
    expect(zhSave).toBeDefined();
    if (!enSave || !zhSave) return;

    expect(zhSave.name).toBe(enSave.name);
    expect(Object.keys(zhSave.inputSchema.properties)).toEqual(
      Object.keys(enSave.inputSchema.properties),
    );
    expect(zhSave.description).toContain("保存");
    expect(zhSave.inputSchema.properties.content.description).toContain("洞察");
  });

  it("has complete zh-CN coverage for every MCP tool and property description", () => {
    const enTools = getAllTools("en");
    const zhTools = getAllTools("zh-CN");
    expect(zhTools).toHaveLength(enTools.length);
    expect(zhTools).toHaveLength(53);

    const cjk = /[\u3400-\u9fff]/;
    for (let i = 0; i < enTools.length; i++) {
      const enTool = enTools[i];
      const zhTool = zhTools[i];
      expect(zhTool.name).toBe(enTool.name);
      expect(zhTool.inputSchema.required).toEqual(enTool.inputSchema.required);
      expect(Object.keys(zhTool.inputSchema.properties)).toEqual(
        Object.keys(enTool.inputSchema.properties),
      );
      expect(zhTool.description, enTool.name).not.toBe(enTool.description);
      expect(zhTool.description, enTool.name).toMatch(cjk);

      for (const [key, enProp] of Object.entries(enTool.inputSchema.properties)) {
        const zhProp = zhTool.inputSchema.properties[key];
        expect(zhProp.type, `${enTool.name}.${key}`).toBe(enProp.type);
        expect(zhProp.description, `${enTool.name}.${key}`).not.toBe(
          enProp.description,
        );
        expect(zhProp.description, `${enTool.name}.${key}`).toMatch(cjk);
      }
    }
  });

  it("keeps tool names, property names, and enum/control values in English", () => {
    const tools = getAllTools("zh-CN");
    const bridge = tools.find((tool) => tool.name === "memory_claude_bridge_sync");
    const checkpoint = tools.find((tool) => tool.name === "memory_checkpoint");
    const vision = tools.find((tool) => tool.name === "memory_vision_search");

    expect(bridge?.inputSchema.properties.direction.description).toContain("'read'");
    expect(bridge?.inputSchema.properties.direction.description).toContain("'write'");
    expect(checkpoint?.inputSchema.properties.operation.description).toContain(
      "create",
    );
    expect(checkpoint?.inputSchema.properties.operation.description).toContain(
      "resolve",
    );
    expect(vision?.description).toContain("AGENTMEMORY_IMAGE_EMBEDDINGS=true");
  });

  it("uses AGENTMEMORY_LOCALE for mcp::tools::list", async () => {
    let listHandler:
      | ((req: { headers?: Record<string, string> }) => Promise<{ status_code: number; body: unknown }>)
      | undefined;
    const sdk = {
      registerFunction: vi.fn((id: string, cb: typeof listHandler) => {
        if (id === "mcp::tools::list") listHandler = cb;
      }),
      registerTrigger: vi.fn(),
    } as unknown as import("iii-sdk").ISdk;
    const kv = {} as never;

    registerMcpEndpoints(sdk, kv);
    if (!listHandler) throw new Error("mcp::tools::list not registered");

    const response = await listHandler({});
    expect(response.status_code).toBe(200);
    const tools = (response.body as { tools: Array<{ name: string; description: string }> }).tools;
    const save = tools.find((tool) => tool.name === "memory_save");
    expect(save?.description).toContain("保存");
  });
});
