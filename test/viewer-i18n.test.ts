import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  serializeViewerLocaleBundle,
  type ViewerLocaleBundle,
} from "../src/viewer/locales.js";

const ORIGINAL_LOCALE = process.env["AGENTMEMORY_LOCALE"];
const ORIGINAL_VIEWER_LANGUAGE = process.env["VIEWER_LANGUAGE"];

const repoRoot = new URL("..", import.meta.url).pathname;

function readLocale(name: string) {
  return JSON.parse(
    readFileSync(join(repoRoot, "src", "viewer", "locales", `${name}.json`), "utf-8"),
  ) as Record<string, unknown>;
}

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

async function renderWithLocale(locale?: string) {
  vi.resetModules();
  if (locale === undefined) delete process.env["AGENTMEMORY_LOCALE"];
  else process.env["AGENTMEMORY_LOCALE"] = locale;
  delete process.env["VIEWER_LANGUAGE"];
  const { renderViewerDocument } = await import("../src/viewer/document.js");
  const rendered = renderViewerDocument();
  expect(rendered.found).toBe(true);
  if (!rendered.found) throw new Error("viewer document not found");
  return rendered.html;
}

afterEach(() => {
  if (ORIGINAL_LOCALE === undefined) delete process.env["AGENTMEMORY_LOCALE"];
  else process.env["AGENTMEMORY_LOCALE"] = ORIGINAL_LOCALE;
  if (ORIGINAL_VIEWER_LANGUAGE === undefined) delete process.env["VIEWER_LANGUAGE"];
  else process.env["VIEWER_LANGUAGE"] = ORIGINAL_VIEWER_LANGUAGE;
});

describe("viewer i18n", () => {
  it("injects the zh-CN locale bundle into the nonce-backed viewer script", async () => {
    const html = await renderWithLocale("zh-CN");

    expect(html).toContain("window.__AM_LOCALE__ = ");
    expect(html).toContain('"locale":"zh-CN"');
    expect(html).toContain('"graph":"图谱"');
    expect(html).toContain('"actions":"任务"');
    expect(html).not.toContain("__AGENTMEMORY_VIEWER_LOCALE__");
  });

  it("keeps all nav tabs wired to locale keys", async () => {
    const html = await renderWithLocale("zh-CN");
    const required = [
      "dashboard",
      "graph",
      "memories",
      "timeline",
      "sessions",
      "lessons",
      "actions",
      "crystals",
      "audit",
      "activity",
      "profile",
      "replay",
    ];

    for (const tab of required) {
      expect(html).toContain(`data-tab="${tab}"`);
      expect(html).toContain(`data-i18n="nav.${tab}"`);
    }
  });

  it("has the required Chinese nav labels and uses 任务 for actions", () => {
    const zh = readLocale("zh-CN") as { nav: Record<string, string> };
    expect(zh.nav).toMatchObject({
      graph: "图谱",
      memories: "记忆",
      timeline: "时间线",
      sessions: "会话",
      lessons: "经验",
      actions: "任务",
      crystals: "结晶",
      audit: "审计",
      activity: "动态",
      profile: "画像",
      replay: "回放",
    });
  });

  it("keeps zh-CN locale keys in parity with English", () => {
    expect(flattenKeys(readLocale("zh-CN")).sort()).toEqual(
      flattenKeys(readLocale("en")).sort(),
    );
  });

  it("ships Chinese labels for dashboard runtime panels", () => {
    const zh = readLocale("zh-CN") as {
      dashboard?: {
        stats?: Record<string, string>;
        panels?: Record<string, string>;
        metrics?: Record<string, string>;
      };
    };

    expect(zh.dashboard?.stats).toMatchObject({
      sessions: "会话",
      memories: "记忆",
      health: "健康状态",
      tokenSavings: "Token 节省",
      tokensSaved: "约 {{tokens}} 个 token · 已节省 {{cost}}",
    });
    expect(zh.dashboard?.panels).toMatchObject({
      recentSessions: "最近会话",
      recentActivity: "最近动态",
      workers: "工作进程",
      semanticMemory: "语义记忆",
      proceduralMemory: "流程记忆",
      memoryRelations: "记忆关系",
    });
    expect(zh.dashboard?.metrics).toMatchObject({
      function: "函数",
      calls: "调用",
      success: "成功",
      fail: "失败",
      avgLatency: "平均延迟",
      quality: "质量",
    });
    expect((zh as { flags?: Record<string, string> }).flags).toMatchObject({
      requiresLlm: "需要 LLM 提供方密钥（ANTHROPIC_API_KEY、GEMINI_API_KEY 等）。",
      noProviderTitle: "没有设置 LLM 提供方密钥",
      bm25Title: "正在以仅 BM25 模式运行",
    });
  });

  it("renders dashboard runtime chrome through locale keys instead of hardcoded English", () => {
    const html = readFileSync(join(repoRoot, "src", "viewer", "index.html"), "utf-8");
    const dashboardHtml = html.slice(
      html.indexOf("function renderDashboard()"),
      html.indexOf("var dashboardTimer"),
    );
    const hardcodedDashboardText = [
      "Function Metrics (OTel)",
      ">Workers<",
      "Circuit Breaker Details",
      "Semantic Memory",
      "No semantic facts yet.",
      "Procedural Memory",
      "No procedures yet.",
      "Trigger: ",
      "Freq: ",
      "Consolidation Status",
      "Semantic facts</span>",
      "Memory Relations",
      ">Refresh</button>",
      "Auto-refresh 30s",
    ];

    for (const text of hardcodedDashboardText) {
      expect(dashboardHtml).not.toContain(text);
    }
  });

  it("renders core non-dashboard chrome through locale keys instead of hardcoded English", () => {
    const html = readFileSync(join(repoRoot, "src", "viewer", "index.html"), "utf-8");
    const hardcodedViewerText = [
      "Loading memories...",
      "Search memories...",
      "No memories yet",
      "Delete Memory",
      "Loading timeline...",
      "Select a session to view observations",
      "observations shown",
      "Activity Feed",
      "Graph Stats",
      "Filter by Type",
      "Rebuild Graph",
      "No graph data yet.",
      "Loading sessions...",
      "Tool Invocations",
      "Activity Breakdown",
      "Top Concepts",
      "Project Stats",
      "Feature flags",
      "Import JSONL</button>",
      "Pick a session to replay",
    ];

    for (const text of hardcodedViewerText) {
      expect(html).not.toContain(text);
    }
  });

  it("escapes script-breaking characters in injected locale JSON", () => {
    const bundle: ViewerLocaleBundle = {
      locale: "zh-CN",
      messages: {
        en: { test: "</script>" },
        current: { test: "</script>" },
      },
    };

    const serialized = serializeViewerLocaleBundle(bundle);
    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script>");
  });

  it("does not allow localized attributes to target URL or event-handler attributes", async () => {
    const html = await renderWithLocale("zh-CN");
    const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1] || "";

    expect(script).toContain("SAFE_I18N_ATTRS");
    expect(script).not.toMatch(/href\s*:\s*true/);
    expect(script).not.toMatch(/src\s*:\s*true/);
    expect(script).not.toMatch(/onclick\s*:\s*true/);
  });
});
