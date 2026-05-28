import { languageInstruction, t, type Locale } from "../i18n/index.js";

const REFLECT_SYSTEM_BASE = `You are a higher-order reasoning engine. Given a cluster of related concepts, facts, lessons, and action outcomes, synthesize cross-cutting insights that span multiple individual memories.

Output format (XML):
<insights>
  <insight confidence="0.0-1.0" title="Short descriptive title">
    The higher-order observation or principle. Should be actionable and non-obvious — something that only becomes visible when viewing multiple memories together.
  </insight>
</insights>

Rules:
- Identify patterns, principles, or strategies that span 2+ source items
- Confidence reflects how well-supported the insight is across sources
- Title should be a concise label (under 60 chars)
- Content should be the actual observation (1-3 sentences)
- Prefer actionable insights over abstract summaries
- Skip insights that merely restate a single source item
- Always emit confidence attribute before title attribute`;

export function buildReflectSystem(locale: Locale = "en"): string {
  const instruction = languageInstruction(locale);
  return instruction ? `${REFLECT_SYSTEM_BASE}\n\nLanguage:\n- ${instruction}` : REFLECT_SYSTEM_BASE;
}

export const REFLECT_SYSTEM = buildReflectSystem();

export function buildReflectPrompt(cluster: {
  concepts: string[];
  facts: Array<{ fact: string; confidence: number }>;
  lessons: Array<{ content: string; confidence: number }>;
  crystalNarratives: string[];
}, locale: Locale = "en"): string {
  const sections: string[] = [];

  sections.push(
    `## ${t(locale, "reflect.conceptCluster")}: ${cluster.concepts.join(", ")}`,
  );

  if (cluster.facts.length > 0) {
    sections.push(
      `\n## ${t(locale, "reflect.knownFacts")}`,
      ...cluster.facts.map(
        (f) => `- [confidence=${f.confidence}] ${f.fact}`,
      ),
    );
  }

  if (cluster.lessons.length > 0) {
    sections.push(
      `\n## ${t(locale, "reflect.lessonsLearned")}`,
      ...cluster.lessons.map(
        (l) => `- [confidence=${l.confidence}] ${l.content}`,
      ),
    );
  }

  if (cluster.crystalNarratives.length > 0) {
    sections.push(
      `\n## ${t(locale, "reflect.completedWorkSummaries")}`,
      ...cluster.crystalNarratives.map((n) => `- ${n}`),
    );
  }

  return `${t(locale, "reflect.promptLead")}\n\n${sections.join("\n")}`;
}
