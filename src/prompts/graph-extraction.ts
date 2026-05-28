import { languageInstruction, type Locale } from "../i18n/index.js";

const GRAPH_EXTRACTION_SYSTEM_BASE = `You are a knowledge graph extraction engine. Given a compressed observation from a coding session, extract entities and relationships.

Output format (XML):
<entities>
  <entity type="file|function|concept|error|decision|pattern|library|person" name="exact name">
    <property key="key">value</property>
  </entity>
</entities>
<relationships>
  <relationship type="uses|imports|modifies|causes|fixes|depends_on|related_to" source="entity name" target="entity name" weight="0.1-1.0"/>
</relationships>

Rules:
- Extract concrete entities only (real file paths, function names, library names)
- Use the most specific type available
- Weight relationships by how strong/direct the connection is
- If no entities found, output empty tags`;

export function buildGraphExtractionSystem(locale: Locale = "en"): string {
  const instruction = languageInstruction(locale);
  return instruction
    ? `${GRAPH_EXTRACTION_SYSTEM_BASE}\n\nLanguage:\n- ${instruction}\n- Keep entity names, entity type values, relationship type values, XML attributes, and file paths exactly as observed.`
    : GRAPH_EXTRACTION_SYSTEM_BASE;
}

export const GRAPH_EXTRACTION_SYSTEM = buildGraphExtractionSystem();

export function buildGraphExtractionPrompt(
  observations: Array<{
    title: string;
    narrative: string;
    concepts: string[];
    files: string[];
    type: string;
  }>,
): string {
  const items = observations
    .map(
      (o, i) =>
        `[${i + 1}] Type: ${o.type}\nTitle: ${o.title}\nNarrative: ${o.narrative}\nConcepts: ${(o.concepts ?? []).join(", ")}\nFiles: ${(o.files ?? []).join(", ")}`,
    )
    .join("\n\n");
  return `Extract entities and relationships from these observations:\n\n${items}`;
}
