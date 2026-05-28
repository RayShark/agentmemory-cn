import { platform } from "node:os";
import * as p from "@clack/prompts";
import { currentCliLocale, cliTFor } from "../i18n.js";
import type { Locale } from "../../i18n/index.js";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import { adapter as antigravity } from "./antigravity.js";
import { adapter as claudeCode } from "./claude-code.js";
import { adapter as codex } from "./codex.js";
import { adapter as cursor } from "./cursor.js";
import { adapter as geminiCli } from "./gemini-cli.js";
import { adapter as hermes } from "./hermes.js";
import { adapter as kiro } from "./kiro.js";
import { adapter as opencode } from "./opencode.js";
import { adapter as openclaw } from "./openclaw.js";
import { adapter as openhuman } from "./openhuman.js";
import { adapter as pi } from "./pi.js";
import { adapter as qwen } from "./qwen.js";

export const ADAPTERS: readonly ConnectAdapter[] = [
  claudeCode,
  codex,
  cursor,
  geminiCli,
  qwen,
  antigravity,
  kiro,
  opencode,
  openclaw,
  hermes,
  pi,
  openhuman,
];

export function resolveAdapter(name: string): ConnectAdapter | null {
  const lower = name.toLowerCase();
  return ADAPTERS.find((a) => a.name === lower) ?? null;
}

export function knownAgents(): string[] {
  return ADAPTERS.map((a) => a.name);
}

function parseFlags(args: string[]): {
  dryRun: boolean;
  force: boolean;
  all: boolean;
  withHooks: boolean;
  positional: string[];
} {
  const positional: string[] = [];
  let dryRun = false;
  let force = false;
  let all = false;
  let withHooks = false;
  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (a === "--force") force = true;
    else if (a === "--all") all = true;
    else if (a === "--with-hooks") withHooks = true;
    else if (!a.startsWith("-")) positional.push(a);
  }
  return { dryRun, force, all, withHooks, positional };
}

export async function runAdapter(
  adapter: ConnectAdapter,
  opts: ConnectOptions,
): Promise<ConnectResult> {
  const locale = opts.locale ?? currentCliLocale();
  if (!adapter.detect()) {
    const docs = adapter.docs
      ? cliTFor(locale, "connect.docsSuffix", { docs: adapter.docs })
      : "";
    p.log.warn(cliTFor(locale, "connect.notDetected", { agent: adapter.displayName, docs }));
    return { kind: "skipped", reason: "not-detected" };
  }
  p.log.step(cliTFor(locale, "connect.wiring", { agent: adapter.displayName }));
  if (adapter.protocolNote) {
    p.log.message(protocolNoteFor(adapter, locale));
  }
  try {
    return await adapter.install(opts);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    p.log.error(cliTFor(locale, "connect.adapterError", { agent: adapter.displayName, reason }));
    return { kind: "skipped", reason: "exception" };
  }
}

export async function runConnect(args: string[]): Promise<void> {
  const locale = currentCliLocale();
  if (platform() === "win32") {
    p.intro(cliTFor(locale, "connect.intro"));
    p.log.warn(cliTFor(locale, "connect.windowsUnsupported"));
    p.outro(cliTFor(locale, "connect.windowsOutro"));
    return;
  }

  const { dryRun, force, all, withHooks, positional } = parseFlags(args);
  const opts: ConnectOptions = {
    dryRun,
    force,
    withHooks,
    locale,
  };

  p.intro(cliTFor(locale, "connect.intro"));

  if (positional.length === 0 && !all) {
    const detected = ADAPTERS.filter((a) => a.detect());
    if (detected.length === 0) {
      p.log.error(cliTFor(locale, "connect.noneDetected"));
      p.outro(cliTFor(locale, "connect.supported", { agents: knownAgents().join(", ") }));
      process.exit(1);
    }
    const picked = await p.multiselect<string>({
      message: cliTFor(locale, "connect.pickAgents"),
      options: detected.map((a) => ({ value: a.name, label: a.displayName })),
      required: true,
    });
    if (p.isCancel(picked)) {
      p.cancel(cliTFor(locale, "connect.cancelled"));
      return;
    }
    const results: { name: string; result: ConnectResult }[] = [];
    for (const name of picked as string[]) {
      const adapter = resolveAdapter(name);
      if (!adapter) continue;
      results.push({ name, result: await runAdapter(adapter, opts) });
    }
    summarize(results, locale);
    return;
  }

  if (all) {
    const detected = ADAPTERS.filter((a) => a.detect());
    if (detected.length === 0) {
      p.log.error(cliTFor(locale, "connect.noneDetected"));
      process.exit(1);
    }
    const results: { name: string; result: ConnectResult }[] = [];
    for (const adapter of detected) {
      results.push({
        name: adapter.name,
        result: await runAdapter(adapter, opts),
      });
    }
    summarize(results, locale);
    return;
  }

  const agentName = positional[0]!;
  const adapter = resolveAdapter(agentName);
  if (!adapter) {
    p.log.error(cliTFor(locale, "connect.unknownAgent", { agent: agentName }));
    p.outro(cliTFor(locale, "connect.supported", { agents: knownAgents().join(", ") }));
    process.exit(1);
  }

  const result = await runAdapter(adapter, opts);
  summarize([{ name: agentName, result }], locale);
  if (result.kind === "skipped" && (result as { reason: string }).reason !== "not-detected") {
    process.exit(1);
  }
}

function protocolNoteFor(adapter: ConnectAdapter, locale: Locale): string {
  const key = `connect.protocolNotes.${adapter.name}`;
  const translated = cliTFor(locale, key);
  return translated === `cli.${key}` ? adapter.protocolNote ?? "" : translated;
}

function summarize(
  results: { name: string; result: ConnectResult }[],
  locale: Locale,
): void {
  const lines = results.map(({ name, result }) => {
    switch (result.kind) {
      case "installed":
        return `  ✓ ${
          result.mutatedPath
            ? cliTFor(locale, "connect.installedLine", {
                agent: name,
                path: result.mutatedPath,
              })
            : cliTFor(locale, "connect.installedAgentLine", { agent: name })
        }`;
      case "already-wired":
        return `  ✓ ${cliTFor(locale, "connect.alreadyWiredLine", { agent: name })}`;
      case "stub":
        return `  ⚠ ${cliTFor(locale, "connect.manualLine", { agent: name, reason: result.reason })}`;
      case "skipped":
        return `  ✗ ${cliTFor(locale, "connect.skippedLine", { agent: name, reason: result.reason })}`;
    }
  });
  p.note(lines.join("\n"), cliTFor(locale, "connect.summaryTitle"));

  const stubs = results.filter((r) => r.result.kind === "stub");
  if (stubs.length > 0) {
    p.log.info(cliTFor(locale, "connect.manualCount", { count: stubs.length }));
  }
  p.outro(cliTFor(locale, "connect.restartOutro"));
}
