// First-run interactive onboarding flow.
//
// Wakes up only when `isFirstRun()` is true (preferences are missing or
// have never recorded a `firstRunAt`) or when the user passes
// `--reset`. The flow asks for:
//
//   1. Which agents will be wired to agentmemory (multi-select). Each
//      option carries a small glyph that we reuse in /status output so
//      the user recognises them later. The label mirrors README row 1
//      (native plugins) and row 2 (MCP-only).
//   2. Which LLM provider to use for compress / consolidate / graph.
//      "skip — BM25-only mode" is a real first-class option; lots of
//      users want agentmemory purely as a hybrid keyword + vector
//      memory layer without granting LLM API keys.
//
// We then write `~/.agentmemory/preferences.json` and seed
// `~/.agentmemory/.env` with a commented-out `*_API_KEY=` line for the
// chosen provider. This matches the existing `agentmemory init` flow
// closely so users who skip onboarding still get the same file via
// `agentmemory init`.

import { copyFile, mkdir } from "node:fs/promises";
import { constants as fsConstants, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { writePrefs } from "./preferences.js";
import { resolveAdapter, runAdapter } from "./connect/index.js";
import type { ConnectResult } from "./connect/types.js";
import { currentCliLocale, cliTFor } from "./i18n.js";
import type { Locale } from "../i18n/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Native plugin row — these agents ship an agentmemory plugin or
// first-party integration. Glyphs match SkillKit's published set
// where they overlap; the rest fall back to the generic `◇`.
const NATIVE_AGENTS: { value: string; label: string; glyph: string }[] = [
  { value: "claude-code", label: "Claude Code", glyph: "⟁" },
  { value: "codex", label: "Codex", glyph: "◎" },
  { value: "openhuman", label: "OpenHuman", glyph: "◇" },
  { value: "openclaw", label: "OpenClaw", glyph: "◇" },
  { value: "hermes", label: "Hermes", glyph: "◇" },
  { value: "pi", label: "Pi", glyph: "◇" },
  { value: "cursor", label: "Cursor", glyph: "◫" },
  { value: "gemini-cli", label: "Gemini CLI", glyph: "✦" },
];

// MCP-only row — these agents use the MCP server we ship rather than
// a native plugin.
const MCP_AGENTS: { value: string; label: string; glyph: string }[] = [
  { value: "opencode", label: "OpenCode", glyph: "⬡" },
  { value: "cline", label: "Cline", glyph: "◇" },
  { value: "goose", label: "Goose", glyph: "◇" },
  { value: "kilo", label: "Kilo", glyph: "◇" },
  { value: "aider", label: "Aider", glyph: "◇" },
  { value: "claude-desktop", label: "Claude Desktop", glyph: "⟁" },
  { value: "windsurf", label: "Windsurf", glyph: "◇" },
  { value: "roo", label: "Roo", glyph: "◇" },
];

const PROVIDERS: { value: string; labelKey: string; envKey: string | null }[] = [
  { value: "anthropic", labelKey: "providerAnthropic", envKey: "ANTHROPIC_API_KEY" },
  { value: "openai", labelKey: "providerOpenai", envKey: "OPENAI_API_KEY" },
  { value: "gemini", labelKey: "providerGemini", envKey: "GEMINI_API_KEY" },
  { value: "openrouter", labelKey: "providerOpenrouter", envKey: "OPENROUTER_API_KEY" },
  { value: "minimax", labelKey: "providerMinimax", envKey: "MINIMAX_API_KEY" },
  { value: "skip", labelKey: "providerSkip", envKey: null },
];

function onboardingT(
  locale: Locale,
  key: string,
  params: Record<string, string | number | boolean> = {},
): string {
  return cliTFor(locale, `onboarding.${key}`, params);
}

function buildAgentOptions(locale: Locale): { value: string; label: string; hint?: string }[] {
  return [
    ...NATIVE_AGENTS.map((a) => ({
      value: a.value,
      label: `${a.glyph} ${a.label}`,
      hint: onboardingT(locale, "nativePluginHint"),
    })),
    ...MCP_AGENTS.map((a) => ({
      value: a.value,
      label: `${a.glyph} ${a.label}`,
      hint: onboardingT(locale, "mcpServerHint"),
    })),
  ];
}

function buildProviderOptions(locale: Locale): { value: string; label: string }[] {
  return PROVIDERS.map(({ value, labelKey }) => ({
    value,
    label: onboardingT(locale, labelKey),
  }));
}

// Mirror src/cli.ts findEnvExample so onboarding ships the same .env
// skeleton whether called directly or via `agentmemory init`. We
// duplicate (rather than import) so the onboarding module doesn't
// pull cli.ts's top-level side effects into the test runner.
function findEnvExample(): string | null {
  const candidates = [
    join(__dirname, "..", "..", ".env.example"),
    join(__dirname, "..", ".env.example"),
    join(__dirname, ".env.example"),
    join(process.cwd(), ".env.example"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

async function seedEnvFile(provider: string | null): Promise<string | null> {
  const target = join(homedir(), ".agentmemory", ".env");
  const dir = dirname(target);
  await mkdir(dir, { recursive: true });

  const template = findEnvExample();
  if (template && !existsSync(target)) {
    try {
      await copyFile(template, target, fsConstants.COPYFILE_EXCL);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") {
        return null;
      }
    }
  } else if (!template && !existsSync(target)) {
    // Fall back to a minimal skeleton so users always get a `.env` to
    // edit. This matches the shape of the bundled `.env.example`
    // without forcing us to keep two copies in sync.
    const lines = [
      "# agentmemory environment — uncomment what you need",
      "# AGENTMEMORY_URL=http://localhost:3111",
      "",
    ];
    const envKey = PROVIDERS.find((x) => x.value === provider)?.envKey;
    if (envKey) {
      lines.push(`# ${envKey}=`);
    }
    writeFileSync(target, lines.join("\n"), { mode: 0o600 });
  }

  return target;
}

export interface OnboardingResult {
  agents: string[];
  provider: string | null;
}

function shouldSkipInteractiveOnboarding(): boolean {
  const ci = process.env["CI"];
  return (
    process.stdin.isTTY !== true ||
    process.stdout.isTTY !== true ||
    (ci !== undefined && ci !== "" && ci !== "0" && ci.toLowerCase() !== "false")
  );
}

function writeDefaultOnboardingPrefs(): OnboardingResult {
  writePrefs({
    lastAgent: null,
    lastAgents: [],
    lastProvider: null,
    skipSplash: true,
    firstRunAt: new Date().toISOString(),
  });
  return { agents: [], provider: null };
}

export async function runOnboarding(): Promise<OnboardingResult> {
  if (shouldSkipInteractiveOnboarding()) {
    return writeDefaultOnboardingPrefs();
  }

  const locale = currentCliLocale();

  p.note(onboardingT(locale, "welcome"), onboardingT(locale, "title"));

  const agentsPicked = await p.multiselect<string>({
    message: onboardingT(locale, "agentsQuestion"),
    options: buildAgentOptions(locale),
    required: false,
    initialValues: ["claude-code"],
  });
  if (p.isCancel(agentsPicked)) {
    p.cancel(onboardingT(locale, "cancelled"));
    process.exit(0);
  }

  const pickedAgentsList = (agentsPicked as string[]) ?? [];
  if (pickedAgentsList.length > 0) {
    p.note(onboardingT(locale, "howThisWorks"), onboardingT(locale, "howThisWorksTitle"));
  }

  const providerPicked = await p.select<string>({
    message: onboardingT(locale, "providerQuestion"),
    options: buildProviderOptions(locale),
    initialValue: "anthropic",
  });
  if (p.isCancel(providerPicked)) {
    p.cancel(onboardingT(locale, "cancelled"));
    process.exit(0);
  }

  const provider = providerPicked === "skip" ? null : providerPicked;
  const agents = (agentsPicked as string[]) ?? [];

  const envPath = await seedEnvFile(provider);

  writePrefs({
    lastAgent: agents[0] ?? null,
    lastAgents: agents,
    lastProvider: provider,
    skipSplash: true,
    firstRunAt: new Date().toISOString(),
  });

  const prefsLocation = join(homedir(), ".agentmemory", "preferences.json");
  const lines = [`✓ ${onboardingT(locale, "savedPrefs", { path: prefsLocation })}`];
  if (envPath) {
    lines.push(`✓ ${onboardingT(locale, "wroteEnv", { path: envPath })}`);
  } else {
    lines.push(`! ${onboardingT(locale, "envWriteFailed")}`);
  }
  if (provider) {
    const envKey = PROVIDERS.find((x) => x.value === provider)?.envKey;
    if (envKey) {
      lines.push(`  ${onboardingT(locale, "uncommentProvider", { envKey, provider })}`);
    }
  } else {
    lines.push(`  ${onboardingT(locale, "noProvider")}`);
  }
  p.note(lines.join("\n"), onboardingT(locale, "readyTitle"));

  if (agents.length > 0) {
    await wireSelectedAgents(agents, locale);
  }

  return { agents, provider };
}

async function wireSelectedAgents(agents: string[], locale: Locale): Promise<void> {
  p.note(onboardingT(locale, "wireNowPrompt"), onboardingT(locale, "wireNowTitle"));
  const confirmed = await p.confirm({
    message: onboardingT(locale, "wireNow"),
    initialValue: true,
  });

  if (p.isCancel(confirmed) || confirmed === false) {
    const cmds = agents.map((a) => `  agentmemory connect ${a}`);
    p.note([onboardingT(locale, "wireLater"), ...cmds].join("\n"), onboardingT(locale, "wireLaterTitle"));
    return;
  }

  const wired: string[] = [];
  const manual: { name: string; docs?: string }[] = [];
  const failed: { name: string; reason: string }[] = [];

  for (const name of agents) {
    const adapter = resolveAdapter(name);
    if (!adapter) {
      const reason = onboardingT(locale, "noAdapterReason");
      failed.push({ name, reason });
      p.log.warn(onboardingT(locale, "noAdapterWarning", { agent: name }));
      continue;
    }
    p.log.step(cliTFor(locale, "connect.wiring", { agent: name }));
    let result: ConnectResult;
    try {
      result = await runAdapter(adapter, { dryRun: false, force: false, locale });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failed.push({ name, reason });
      p.log.error(onboardingT(locale, "adapterError", { agent: name, reason }));
      continue;
    }
    switch (result.kind) {
      case "installed":
      case "already-wired":
        wired.push(name);
        break;
      case "stub":
        manual.push({ name, docs: adapter.docs });
        break;
      case "skipped":
        failed.push({ name, reason: result.reason });
        break;
    }
  }

  const summary: string[] = [];
  if (wired.length > 0) {
    summary.push(onboardingT(locale, "wired", { agents: wired.join(", ") }));
  }
  if (manual.length > 0 || failed.length > 0) {
    const parts: string[] = [];
    for (const m of manual) {
      parts.push(
        onboardingT(locale, "manualInstallRequired", {
          agent: m.name,
          docs: m.docs
            ? onboardingT(locale, "manualDocsSuffix", { docs: m.docs })
            : "",
        }),
      );
    }
    for (const f of failed) {
      parts.push(onboardingT(locale, "failedItem", { agent: f.name, reason: f.reason }));
    }
    summary.push(onboardingT(locale, "skippedFailed", { items: parts.join(", ") }));
  }
  if (summary.length === 0) {
    summary.push(onboardingT(locale, "noneWired"));
  }
  p.note(summary.join("\n"), onboardingT(locale, "wireSummaryTitle"));
}
