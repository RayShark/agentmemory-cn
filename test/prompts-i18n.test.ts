import { describe, it, expect } from "vitest";
import {
  buildCompressionPrompt,
  buildCompressionSystem,
} from "../src/prompts/compression.js";
import {
  buildReduceSystem,
  buildSummarySystem,
} from "../src/prompts/summary.js";
import { buildGraphExtractionSystem } from "../src/prompts/graph-extraction.js";
import {
  buildProceduralExtractionSystem,
  buildSemanticMergeSystem,
} from "../src/prompts/consolidation.js";
import { buildReflectSystem } from "../src/prompts/reflect.js";
import { buildVisionDescriptionPrompt } from "../src/prompts/vision.js";
import { buildCrystallizeSystem } from "../src/functions/crystallize.js";
import { buildFlowCompressSystem } from "../src/functions/flow-compress.js";
import { buildSkillExtractSystem } from "../src/functions/skill-extract.js";
import { buildConsolidationSystem } from "../src/functions/consolidate.js";
import { buildTemporalExtractionSystem } from "../src/functions/temporal-graph.js";
import { buildQueryExpansionSystem } from "../src/functions/query-expansion.js";
import { buildSlidingWindowSystem } from "../src/functions/sliding-window.js";
import type { Locale } from "../src/i18n/index.js";

const ZH: Locale = "zh-CN";

describe("locale-aware LLM prompts", () => {
  it.each([
    ["compression", buildCompressionSystem],
    ["summary", buildSummarySystem],
    ["reduce", buildReduceSystem],
    ["graph extraction", buildGraphExtractionSystem],
    ["semantic merge", buildSemanticMergeSystem],
    ["procedural extraction", buildProceduralExtractionSystem],
    ["reflection", buildReflectSystem],
    ["vision description", buildVisionDescriptionPrompt],
    ["crystallize", buildCrystallizeSystem],
    ["flow compression", buildFlowCompressSystem],
    ["skill extraction", buildSkillExtractSystem],
    ["legacy consolidation", buildConsolidationSystem],
    ["temporal graph", buildTemporalExtractionSystem],
    ["query expansion", buildQueryExpansionSystem],
    ["sliding window", buildSlidingWindowSystem],
  ])("%s includes the zh-CN language instruction", (_name, builder) => {
    const prompt = builder(ZH);
    expect(prompt).toContain("简体中文");
    expect(prompt).toContain("XML/JSON");
    expect(prompt).toContain("enum");
  });

  it("keeps compression XML tags and observation enum values in English", () => {
    const prompt = buildCompressionSystem(ZH);
    expect(prompt).toContain("<observation>");
    expect(prompt).toContain("<type>one of: file_read");
    expect(prompt).toContain("<title>");
    expect(prompt).toContain("<narrative>");
  });

  it("localizes compression input labels without changing hook and tool values", () => {
    const prompt = buildCompressionPrompt(
      {
        hookType: "prompt_submit",
        toolName: "Read",
        toolInput: { file_path: "src/index.ts" },
        toolOutput: "ok",
        userPrompt: "review i18n",
        timestamp: "2026-05-28T10:00:00.000Z",
      },
      ZH,
    );

    expect(prompt).toContain("时间戳: 2026-05-28T10:00:00.000Z");
    expect(prompt).toContain("钩子: prompt_submit");
    expect(prompt).toContain("工具: Read");
    expect(prompt).toContain("输入:");
    expect(prompt).toContain("输出:");
    expect(prompt).toContain("用户提示:");
  });

  it("keeps graph schema tokens and relationship enum values in English", () => {
    const prompt = buildGraphExtractionSystem(ZH);
    expect(prompt).toContain("<entities>");
    expect(prompt).toContain('type="file|function|concept|error|decision|pattern|library|person"');
    expect(prompt).toContain('type="uses|imports|modifies|causes|fixes|depends_on|related_to"');
  });

  it("keeps crystallize JSON keys in English", () => {
    const prompt = buildCrystallizeSystem(ZH);
    expect(prompt).toContain('"keyOutcomes"');
    expect(prompt).toContain('"filesAffected"');
    expect(prompt).toContain('"lessons"');
  });

  it("keeps skill extraction control tags in English", () => {
    const prompt = buildSkillExtractSystem(ZH);
    expect(prompt).toContain("<skill>");
    expect(prompt).toContain("<expected_outcome>");
    expect(prompt).toContain("<no-skill/>");
  });

  it("keeps temporal graph XML schema and sentiment enum in English", () => {
    const prompt = buildTemporalExtractionSystem(ZH);
    expect(prompt).toContain("<temporal_graph>");
    expect(prompt).toContain('type="uses|imports|modifies');
    expect(prompt).toContain("<sentiment>positive|negative|neutral</sentiment>");
  });

  it("keeps query expansion and sliding-window XML tags in English", () => {
    expect(buildQueryExpansionSystem(ZH)).toContain("<expansion>");
    expect(buildQueryExpansionSystem(ZH)).toContain("<reformulations>");
    expect(buildSlidingWindowSystem(ZH)).toContain("<enriched>");
    expect(buildSlidingWindowSystem(ZH)).toContain("<resolved_entities>");
  });

  it("does not add zh-CN constraints to the default English prompt", () => {
    expect(buildSummarySystem("en")).not.toContain("简体中文");
  });
});
