import { languageInstruction, t, type Locale } from "../i18n/index.js";

const COMPRESSION_SYSTEM_BASE = `You are a memory compression engine for an AI coding agent. Your job is to extract the essential information from a tool usage observation and compress it into structured data.

Output EXACTLY this XML format with no additional text:

<observation>
  <type>one of: file_read, file_write, file_edit, command_run, search, web_fetch, conversation, error, decision, discovery, subagent, notification, task, other</type>
  <title>Short descriptive title (max 80 chars)</title>
  <subtitle>One-line context (optional)</subtitle>
  <facts>
    <fact>Specific factual detail 1</fact>
    <fact>Specific factual detail 2</fact>
  </facts>
  <narrative>2-3 sentence summary of what happened and why it matters</narrative>
  <concepts>
    <concept>technical concept or pattern</concept>
  </concepts>
  <files>
    <file>path/to/file</file>
  </files>
  <importance>1-10 scale, 10 being critical architectural decision</importance>
</observation>

Rules:
- Be concise but preserve ALL technically relevant details
- File paths must be exact
- Importance: 1-3 for routine reads, 4-6 for edits/commands, 7-9 for architectural decisions, 10 for breaking changes
- Concepts should be reusable search terms (e.g., "React hooks", "SQL migration", "auth middleware")
- Strip any secrets, tokens, or credentials from the output`;

function withLanguageInstruction(system: string, locale: Locale): string {
  const instruction = languageInstruction(locale);
  return instruction ? `${system}\n\nLanguage:\n- ${instruction}` : system;
}

export function buildCompressionSystem(locale: Locale = "en"): string {
  return withLanguageInstruction(COMPRESSION_SYSTEM_BASE, locale);
}

export const COMPRESSION_SYSTEM = buildCompressionSystem();

export function buildCompressionPrompt(observation: {
  hookType: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  userPrompt?: string;
  timestamp: string;
}, locale: Locale = "en"): string {
  const parts = [
    `${t(locale, "promptInput.timestamp")}: ${observation.timestamp}`,
    `${t(locale, "promptInput.hook")}: ${observation.hookType}`,
  ];

  if (observation.toolName) {
    parts.push(`${t(locale, "promptInput.tool")}: ${observation.toolName}`);
  }
  if (observation.toolInput) {
    const input =
      typeof observation.toolInput === "string"
        ? observation.toolInput
        : JSON.stringify(observation.toolInput, null, 2);
    parts.push(`${t(locale, "promptInput.input")}:\n${truncate(input, 4000, locale)}`);
  }
  if (observation.toolOutput) {
    const output =
      typeof observation.toolOutput === "string"
        ? observation.toolOutput
        : JSON.stringify(observation.toolOutput, null, 2);
    parts.push(`${t(locale, "promptInput.output")}:\n${truncate(output, 4000, locale)}`);
  }
  if (observation.userPrompt) {
    parts.push(
      `${t(locale, "promptInput.userPrompt")}:\n${truncate(observation.userPrompt, 2000, locale)}`,
    );
  }

  return parts.join("\n\n");
}

function truncate(s: string, max: number, locale: Locale): string {
  return s.length > max
    ? s.slice(0, max) + `\n[${t(locale, "promptInput.truncated")}]`
    : s;
}
