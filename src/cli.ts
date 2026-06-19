#!/usr/bin/env node

import {
  spawn,
  execFileSync,
  spawnSync,
  type ChildProcess,
} from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, dirname, delimiter as PATH_DELIMITER } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";
import * as p from "@clack/prompts";
import { generateId } from "./state/schema.js";
import {
  buildDiagnostics,
  dryRunPlan,
  parseEnvFile,
  type Diagnostic,
  type DiagnosticFixResult,
  type DoctorContext,
  type DoctorEffects,
} from "./cli/doctor-diagnostics.js";
import {
  buildRemovePlan,
  localBinIii,
  type ConnectManifest,
  type RemoveOptions,
  type RemovePlanItem,
} from "./cli/remove-plan.js";
import { renderSplash } from "./cli/splash.js";
import { isFirstRun, readPrefs, resetPrefs, writePrefs } from "./cli/preferences.js";
import { runOnboarding } from "./cli/onboarding.js";
import { currentCliLocale, cliT, cliTFor } from "./cli/i18n.js";
import type { Locale } from "./i18n/index.js";
import { setBootVerbose } from "./logger.js";
import { VERSION } from "./version.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const IS_WINDOWS = platform() === "win32";
const IS_VERBOSE =
  args.includes("--verbose") ||
  args.includes("-v") ||
  process.env["AGENTMEMORY_VERBOSE"] === "1" ||
  process.env["AGENTMEMORY_VERBOSE"] === "true";

// Propagate the resolved verbosity to the worker's boot logger so the
// 25-line `[agentmemory] X registered` stream is either dropped or
// printed verbatim. Without this the worker's default (env-only) would
// disagree with the CLI flag.
setBootVerbose(IS_VERBOSE);

const IS_RESET = args.includes("--reset");

// Pinned iii-engine version. The unpinned `install.iii.dev/iii/main/install.sh`
// script tracks `latest`, which made every fresh agentmemory install pull
// engine 0.11.6 — and 0.11.6 introduces a new sandbox-everything-via-
// `iii worker add` worker model that agentmemory hasn't been refactored
// for yet (we still use the old `iii-exec watch` config-file model). The
// architectural mismatch surfaces as EPIPE reconnect loops and empty
// search results after save. Pin to v0.11.2 — the last engine that runs
// agentmemory's current worker model cleanly — until the refactor lands.
// Override env var AGENTMEMORY_III_VERSION lets users on the sandbox
// model already point at a newer engine without us cutting a release.
const IIPINNED_VERSION =
  process.env["AGENTMEMORY_III_VERSION"] || "0.11.2";

// Map Node platform/arch → the asset name iii-hq/iii ships under
// https://github.com/iii-hq/iii/releases/download/iii/v<version>/<asset>
function iiiReleaseAsset(): string | null {
  const p = platform();
  const a = process.arch;
  if (p === "darwin" && a === "arm64")
    return "iii-aarch64-apple-darwin.tar.gz";
  if (p === "darwin" && a === "x64")
    return "iii-x86_64-apple-darwin.tar.gz";
  if (p === "linux" && a === "x64")
    return "iii-x86_64-unknown-linux-gnu.tar.gz";
  if (p === "linux" && a === "arm64")
    return "iii-aarch64-unknown-linux-gnu.tar.gz";
  if (p === "linux" && a === "arm")
    return "iii-armv7-unknown-linux-gnueabihf.tar.gz";
  if (p === "win32" && a === "x64")
    return "iii-x86_64-pc-windows-msvc.zip";
  if (p === "win32" && a === "arm64")
    return "iii-aarch64-pc-windows-msvc.zip";
  return null;
}

function iiiReleaseUrl(): string | null {
  const asset = iiiReleaseAsset();
  if (!asset) return null;
  // Tag name is monorepo-prefixed: `iii/v0.11.2`. Slash is URL-encoded
  // by GitHub when serving the download path, hence `iii/v...` not `iii%2Fv...`.
  return `https://github.com/iii-hq/iii/releases/download/iii/v${IIPINNED_VERSION}/${asset}`;
}

function vlog(msg: string): void {
  if (IS_VERBOSE) p.log.info(`[verbose] ${msg}`);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`\n${cliT("help.text", { pinnedVersion: IIPINNED_VERSION })}`);
  process.exit(0);
}

const toolsIdx = args.indexOf("--tools");
if (toolsIdx !== -1 && args[toolsIdx + 1]) {
  process.env["AGENTMEMORY_TOOLS"] = args[toolsIdx + 1];
}

const portIdx = args.indexOf("--port");
if (portIdx !== -1 && args[portIdx + 1]) {
  process.env["III_REST_PORT"] = args[portIdx + 1];
}

const skipEngine = args.includes("--no-engine");

function getRestPort(): number {
  const url = process.env["AGENTMEMORY_URL"];
  if (url) {
    try {
      const parsed = new URL(url).port;
      if (parsed) return parseInt(parsed, 10);
    } catch {}
  }
  return parseInt(process.env["III_REST_PORT"] || "3111", 10) || 3111;
}

function getBaseUrl(): string {
  const url = process.env["AGENTMEMORY_URL"];
  if (url) return url.replace(/\/+$/, "");
  return `http://localhost:${getRestPort()}`;
}

let discoveredViewerPort: number | null = null;

export async function discoverViewerPort(): Promise<void> {
  if (discoveredViewerPort !== null) return;
  try {
    const res = await fetch(`${getBaseUrl()}/agentmemory/livez`, {
      signal: AbortSignal.timeout(1000),
    });
    if (res.ok) {
      const data = await res.json() as { viewerPort?: number | null };
      if (typeof data.viewerPort === "number") {
        discoveredViewerPort = data.viewerPort;
      }
    }
  } catch {}
}

function getViewerUrl(): string {
  const envUrl = process.env["AGENTMEMORY_VIEWER_URL"];
  if (envUrl) return envUrl.replace(/\/+$/, "");
  
  if (discoveredViewerPort !== null) {
    try {
      const u = new URL(getBaseUrl());
      return `${u.protocol}//${u.hostname}:${discoveredViewerPort}`;
    } catch {
      return `http://localhost:${discoveredViewerPort}`;
    }
  }
  
  try {
    const u = new URL(getBaseUrl());
    const vPort =
      parseInt(process.env["III_VIEWER_PORT"] || "", 10) ||
      (parseInt(u.port || "3111", 10) || 3111) + 2;
    return `${u.protocol}//${u.hostname}:${vPort}`;
  } catch {
    const vPort =
      parseInt(process.env["III_VIEWER_PORT"] || "", 10) ||
      getRestPort() + 2;
    return `http://localhost:${vPort}`;
  }
}

// WebSocket streams port. Engine writes here; the SDK and viewer
// subscribe. Honors both `III_STREAM_PORT` (the singular name the
// engine docs use post-0.11) and `III_STREAMS_PORT` (the name our
// own config.ts has used since 0.7) so a single source of truth in
// either form lights up the ready panel.
function getStreamPort(): number {
  return (
    parseInt(process.env["III_STREAM_PORT"] || "", 10) ||
    parseInt(process.env["III_STREAMS_PORT"] || "", 10) ||
    3112
  );
}

// Bridge WebSocket port — the iii engine's internal worker bus.
// Defaults to 49134 (engine convention) and is overridable via
// `III_ENGINE_PORT` or the legacy `III_ENGINE_URL=ws://host:port`.
function getEnginePort(): number {
  const explicit = parseInt(process.env["III_ENGINE_PORT"] || "", 10);
  if (explicit) return explicit;
  const url = process.env["III_ENGINE_URL"];
  if (url) {
    try {
      const parsed = new URL(url).port;
      if (parsed) return parseInt(parsed, 10);
    } catch {}
  }
  return 49134;
}

async function isEngineRunning(): Promise<boolean> {
  try {
    await fetch(`${getBaseUrl()}/`, {
      signal: AbortSignal.timeout(2000),
    });
    return true;
  } catch {
    return false;
  }
}

async function isAgentmemoryReady(): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl()}/agentmemory/livez`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    try {
      const data = await res.json() as { viewerPort?: number | null; viewerSkipped?: boolean };
      if (typeof data.viewerPort === "number") {
        discoveredViewerPort = data.viewerPort;
        return true;
      }
      if (data.viewerSkipped) return true;
      return false;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

function findIiiConfig(): string {
  const candidates = [
    join(__dirname, "iii-config.yaml"),
    join(__dirname, "..", "iii-config.yaml"),
    join(process.cwd(), "iii-config.yaml"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "";
}

function whichBinary(name: string): string | null {
  const cmd = IS_WINDOWS ? "where" : "which";
  try {
    const out = execFileSync(cmd, [name], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const first = out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    return first ?? null;
  } catch {
    return null;
  }
}

function fallbackIiiPaths(): string[] {
  if (IS_WINDOWS) {
    const userProfile = process.env["USERPROFILE"];
    if (!userProfile) return [];
    return [
      join(userProfile, ".local", "bin", "iii.exe"),
      join(userProfile, "bin", "iii.exe"),
    ];
  }
  const home = process.env["HOME"];
  if (!home) return ["/usr/local/bin/iii"];
  return [join(home, ".local", "bin", "iii"), "/usr/local/bin/iii"];
}

function iiiBinVersion(binPath: string): string | null {
  try {
    const out = execFileSync(binPath, ["--version"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    });
    const match = out.match(/(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/);
    return match ? match[1]! : null;
  } catch {
    return null;
  }
}

let warnedVersionMismatch = false;
function warnIfEngineVersionMismatch(iiiBinPath: string | null | undefined): void {
  if (!iiiBinPath || warnedVersionMismatch) return;
  const detected = iiiBinVersion(iiiBinPath);
  if (!detected || detected === IIPINNED_VERSION) return;
  warnedVersionMismatch = true;
  const asset = iiiReleaseAsset();
  const downloadHint = asset
    ? `curl -fsSL https://github.com/iii-hq/iii/releases/download/iii/v${IIPINNED_VERSION}/${asset} | tar -xz -C ~/.local/bin`
    : `download v${IIPINNED_VERSION} from https://github.com/iii-hq/iii/releases/tag/iii%2Fv${IIPINNED_VERSION}`;
  p.log.warn(
    cliTFor(currentCliLocale(), "engine.versionMismatch", {
      detected,
      agentVersion: VERSION,
      pinnedVersion: IIPINNED_VERSION,
      downloadHint,
    }),
  );
}

function enginePidfilePath(): string {
  return join(homedir(), ".agentmemory", "iii.pid");
}

function engineStatePath(): string {
  return join(homedir(), ".agentmemory", "engine-state.json");
}

type EngineState =
  | { kind: "native"; configPath: string; attached?: boolean }
  | { kind: "docker"; composeFile: string };

function writeEnginePidfile(pid: number): void {
  try {
    const pidPath = enginePidfilePath();
    mkdirSync(dirname(pidPath), { recursive: true });
    writeFileSync(pidPath, `${pid}\n`, { encoding: "utf-8" });
  } catch (err) {
    vlog(`writeEnginePidfile: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function readEnginePidfile(): number | null {
  try {
    const pidStr = readFileSync(enginePidfilePath(), "utf-8").trim();
    const pid = parseInt(pidStr, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function clearEnginePidfile(): void {
  try {
    unlinkSync(enginePidfilePath());
  } catch {}
}

// Worker pidfile (#640, #474): the agentmemory worker process
// (`node dist/index.mjs`) is spawned by iii-exec inside the engine. When
// `agentmemory stop` kills only the engine pid, the worker can survive
// (detached spawn, signal not propagated, or kept alive by a wrapper
// script). On the next start, the orphaned worker reconnects to the new
// engine and shows up as a duplicate registration. We write the worker
// pid from src/index.ts on boot so stop can find and reap it.
function workerPidfilePath(): string {
  return join(homedir(), ".agentmemory", "worker.pid");
}

function readWorkerPidfile(): number | null {
  try {
    const pidStr = readFileSync(workerPidfilePath(), "utf-8").trim();
    const pid = parseInt(pidStr, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function clearWorkerPidfile(): void {
  try {
    unlinkSync(workerPidfilePath());
  } catch {}
}

function writeEngineState(state: EngineState): void {
  try {
    const statePath = engineStatePath();
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, `${JSON.stringify(state)}\n`, { encoding: "utf-8" });
  } catch (err) {
    vlog(`writeEngineState: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function readEngineState(): EngineState | null {
  try {
    const raw = readFileSync(engineStatePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<EngineState>;
    if (parsed && (parsed.kind === "native" || parsed.kind === "docker")) {
      return parsed as EngineState;
    }
    return null;
  } catch {
    return null;
  }
}

function clearEngineState(): void {
  try {
    unlinkSync(engineStatePath());
  } catch {}
}

function discoverComposeFile(): string | null {
  const candidates = [
    join(__dirname, "..", "docker-compose.yml"),
    join(__dirname, "docker-compose.yml"),
    join(process.cwd(), "docker-compose.yml"),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

function isInvokedViaNpx(): boolean {
  if (process.env["npm_lifecycle_event"] === "npx") return true;
  const argv1 = process.argv[1] ?? "";
  if (argv1.includes("_npx")) return true;
  const ua = process.env["npm_config_user_agent"] ?? "";
  if (ua.startsWith("npm/") || ua.includes(" npm/")) return true;
  return false;
}

// First-run global-install prompt. Replaces the previous passive
// `p.log.info` hint that users ignored — typing `agentmemory stop`
// in a new shell would then 404 with `command not found`. We now
// ask once, persist the answer in preferences, and never ask again.
async function maybeOfferGlobalInstall(): Promise<void> {
  if (!isInvokedViaNpx()) return;
  if (!process.stdin.isTTY) return;
  if (process.env["CI"]) return;
  const prefs = readPrefs();
  if (prefs.skipGlobalInstall || prefs.skipNpxHint) return;
  const locale = currentCliLocale();

  const answer = await p.confirm({
    message: cliTFor(locale, "globalInstall.prompt"),
    initialValue: true,
  });
  if (p.isCancel(answer)) {
    // Treat Ctrl+C as "not now" rather than "never". Don't persist.
    return;
  }
  if (answer === false) {
    writePrefs({ skipGlobalInstall: true });
    p.log.info(cliTFor(locale, "globalInstall.skipped"));
    return;
  }

  const npmBin = whichBinary("npm");
  if (!npmBin) {
    p.log.warn(cliTFor(locale, "globalInstall.npmMissing"));
    return;
  }
  const ok = runCommand(
    npmBin,
    ["install", "-g", `@agentmemory/agentmemory@${VERSION}`],
    { label: cliTFor(locale, "globalInstall.installing", { version: VERSION }) },
  );
  if (ok) {
    p.log.success(cliTFor(locale, "globalInstall.installed"));
    // Persist so we never re-prompt even if the user happens to npx
    // again from a CI-less TTY.
    writePrefs({ skipGlobalInstall: true });
  } else {
    p.log.warn(cliTFor(locale, "globalInstall.failed"));
  }
}

// iii-console install state.
//   "installed" — `iii-console` is on PATH or at `~/.local/bin/iii-console`
//   "missing"   — binary not found anywhere we look
// We deliberately do NOT probe the console's HTTP port: the binary
// being on disk is the signal we care about (it's not auto-started by
// agentmemory and its default port 3113 collides with our viewer, so
// "is it listening?" is the wrong question at boot time).
type IiiConsoleState =
  | { kind: "installed"; binPath: string }
  | { kind: "missing" };

function detectIiiConsole(): IiiConsoleState {
  const onPath = whichBinary("iii-console");
  if (onPath) return { kind: "installed", binPath: onPath };
  const fallback = IS_WINDOWS
    ? join(process.env["USERPROFILE"] ?? "", ".local", "bin", "iii-console.exe")
    : join(homedir(), ".local", "bin", "iii-console");
  if (fallback && existsSync(fallback)) {
    return { kind: "installed", binPath: fallback };
  }
  return { kind: "missing" };
}

const III_CONSOLE_INSTALL_CMD =
  "curl -fsSL https://install.iii.dev/console/main/install.sh | sh";

async function ensureIiiConsole(): Promise<IiiConsoleState> {
  const state = detectIiiConsole();
  if (state.kind === "installed") return state;

  // Non-interactive contexts get the panel hint but no prompt.
  if (!process.stdin.isTTY || process.env["CI"]) return state;
  const prefs = readPrefs();
  if (prefs.skipConsoleInstall) return state;
  const locale = currentCliLocale();

  const answer = await p.confirm({
    message: cliTFor(locale, "console.prompt"),
    initialValue: true,
  });
  if (p.isCancel(answer)) return state;
  if (answer === false) {
    writePrefs({ skipConsoleInstall: true });
    return state;
  }

  const shBin = whichBinary("sh");
  const curlBin = whichBinary("curl");
  if (!shBin || !curlBin) {
    p.log.warn(cliTFor(locale, "console.missingCurl", { command: III_CONSOLE_INSTALL_CMD }));
    return state;
  }
  const ok = runCommand(shBin, ["-c", III_CONSOLE_INSTALL_CMD], {
    label: cliTFor(locale, "console.installing"),
  });
  if (!ok) {
    p.log.warn(cliTFor(locale, "console.failed", { command: III_CONSOLE_INSTALL_CMD }));
    return state;
  }
  // Re-detect rather than trust install-script output paths.
  return detectIiiConsole();
}

function adoptRunningEngine(): void {
  try {
    const locale = currentCliLocale();
    const existingState = readEngineState();
    const existingPid = readEnginePidfile();
    if (existingState && existingPid) return;

    const pids = findEnginePidsByPort(getRestPort());
    const enginePid = pids[0];
    if (enginePid && !existingPid) {
      writeEnginePidfile(enginePid);
    }
    if (!existingState) {
      writeEngineState({
        kind: "native",
        configPath: findIiiConfig() || "",
        attached: true,
      });
    }
    if (enginePid && !existingPid) {
      p.log.info(cliTFor(locale, "engine.attachedExisting", { pid: enginePid }));
    }
  } catch (err) {
    vlog(`adoptRunningEngine: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function runIiiInstaller(): Promise<{ ok: boolean; binPath: string | null }> {
  const locale = currentCliLocale();
  const releaseUrl = iiiReleaseUrl();
  const asset = iiiReleaseAsset();
  const isZipAsset = asset?.endsWith(".zip") === true;
  const manualUrl = `https://github.com/iii-hq/iii/releases/tag/iii%2Fv${IIPINNED_VERSION}`;

  if (!releaseUrl) {
    p.log.warn(
      cliTFor(locale, "engine.binaryUnavailable", {
        platform: platform(),
        arch: process.arch,
        version: IIPINNED_VERSION,
        url: manualUrl,
      }),
    );
    return { ok: false, binPath: null };
  }

  if (IS_WINDOWS || isZipAsset) {
    p.log.info(
      cliTFor(locale, "engine.autoInstallUnavailable", {
        platform: platform(),
        asset: asset ?? "iii archive",
        url: releaseUrl,
        version: IIPINNED_VERSION,
      }),
    );
    return { ok: false, binPath: null };
  }

  const shBin = whichBinary("sh");
  const curlBin = whichBinary("curl");
  if (!shBin || !curlBin) {
    p.log.warn(cliTFor(locale, "engine.curlMissing"));
    return { ok: false, binPath: null };
  }

  const binDir = join(homedir(), ".local", "bin");
  const binPath = join(binDir, "iii");
  const installCmd = [
    `mkdir -p "${binDir}"`,
    `curl -fsSL "${releaseUrl}" | tar -xz -C "${binDir}"`,
    `chmod +x "${binPath}"`,
  ].join(" && ");
  const installerOk = runCommand(shBin, ["-c", installCmd], {
    label: cliTFor(locale, "engine.installingPinned", { version: IIPINNED_VERSION }),
    optional: true,
  });
  if (!installerOk) {
    p.log.warn(
      cliTFor(locale, "engine.installerFailed", {
        version: IIPINNED_VERSION,
        url: manualUrl,
      }),
    );
    return { ok: false, binPath: null };
  }
  return { ok: true, binPath };
}

type StartupFailure = {
  kind: "no-engine" | "no-docker-compose" | "engine-crashed" | "docker-crashed";
  stderr?: string;
  binary?: string;
};

let startupFailure: StartupFailure | null = null;

// Spawn a background engine and collect any startup stderr for a short
// window. The process is unref'd so the CLI parent can exit cleanly; we
// only care about stderr that shows up BEFORE the health check succeeds,
// which is what surfaces early crash/config-parse errors on all platforms.
function spawnEngineBackground(
  bin: string,
  spawnArgs: string[],
  label: string,
): ChildProcess {
  const locale = currentCliLocale();
  vlog(`spawn: ${bin} ${spawnArgs.join(" ")}`);
  const child = spawn(bin, spawnArgs, {
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  const isDocker = label.includes("Docker");
  if (!isDocker && typeof child.pid === "number") {
    writeEnginePidfile(child.pid);
  }
  const stderrChunks: Buffer[] = [];
  let stderrBytes = 0;
  const MAX_STDERR_CAPTURE = 16 * 1024;
  child.stderr?.on("data", (chunk: Buffer) => {
    if (stderrBytes >= MAX_STDERR_CAPTURE) return;
    const slice = chunk.subarray(0, MAX_STDERR_CAPTURE - stderrBytes);
    stderrChunks.push(slice);
    stderrBytes += slice.length;
  });
  child.on("exit", (code, signal) => {
    const abnormal =
      (code !== null && code !== 0) || (code === null && signal !== null);
    if (abnormal) {
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      startupFailure = {
        kind: isDocker ? "docker-crashed" : "engine-crashed",
        stderr:
        stderr.trim() ||
          (signal
            ? cliTFor(locale, "engine.processKilled", { signal })
            : cliTFor(locale, "engine.processExited", { code: code ?? "unknown" })),
        binary: bin,
      };
      vlog(`engine exited early: code=${code} signal=${signal}`);
      if (IS_VERBOSE && stderr.trim()) {
        p.log.error(`${cliTFor(locale, "engine.stderrTitle")}:\n${stderr}`);
      }
      if (!isDocker) clearEnginePidfile();
      clearEngineState();
    }
  });
  child.unref();
  return child;
}

function startIiiBin(iiiBin: string, configPath: string): boolean {
  const locale = currentCliLocale();
  warnIfEngineVersionMismatch(iiiBin);
  const s = p.spinner();
  s.start(cliTFor(locale, "engine.startingBin", { path: iiiBin }));
  writeEngineState({ kind: "native", configPath });
  spawnEngineBackground(iiiBin, ["--config", configPath], "iii-engine");
  s.stop(cliTFor(locale, "engine.processStarted"));
  return true;
}

async function startEngine(): Promise<boolean> {
  const locale = currentCliLocale();
  const configPath = findIiiConfig();
  let iiiBin = whichBinary("iii");
  vlog(`iii binary: ${iiiBin ?? "(not on PATH)"}, config: ${configPath || "(not found)"}`);

  if (iiiBin && configPath) return startIiiBin(iiiBin, configPath);

  for (const iiiPath of fallbackIiiPaths()) {
    if (existsSync(iiiPath)) {
      const v = iiiBinVersion(iiiPath);
      vlog(`fallback iii at ${iiiPath} reports version: ${v ?? "unknown"}`);
      p.log.info(cliTFor(locale, "engine.foundIii", {
        path: iiiPath,
        versionText: v ? ` (v${v})` : "",
      }));
      process.env["PATH"] = `${dirname(iiiPath)}${PATH_DELIMITER}${process.env["PATH"] ?? ""}`;
      iiiBin = iiiPath;
      break;
    }
  }

  if (iiiBin && configPath) return startIiiBin(iiiBin, configPath);

  if (!configPath) {
    startupFailure = { kind: "no-engine" };
    return false;
  }

  const dockerBin = whichBinary("docker");
  vlog(`docker binary: ${dockerBin ?? "(not on PATH)"}`);
  const dockerComposeCandidates = [
    join(__dirname, "..", "docker-compose.yml"),
    join(__dirname, "docker-compose.yml"),
    join(process.cwd(), "docker-compose.yml"),
  ];
  const composeFile = dockerComposeCandidates.find((c) => existsSync(c));
  vlog(`docker-compose.yml: ${composeFile ?? "(not found)"}`);

  const dockerOptIn =
    process.env["AGENTMEMORY_USE_DOCKER"] === "1" ||
    process.env["AGENTMEMORY_USE_DOCKER"] === "true";
  const interactive = !!process.stdin.isTTY && !process.env["CI"];

  type Choice = "install" | "docker" | "manual";
  let choice: Choice;

  if (dockerOptIn && dockerBin && composeFile) {
    choice = "docker";
  } else if (!interactive) {
    choice = "install";
    p.log.info(cliTFor(locale, "engine.nonInteractiveInstall"));
  } else {
    p.log.warn(cliTFor(locale, "engine.binaryMissing"));
    const options: { value: Choice; label: string; hint?: string }[] = [
      {
        value: "install",
        label: cliTFor(locale, "engine.installOption", { version: IIPINNED_VERSION }),
        hint: cliTFor(locale, "engine.recommendedHint"),
      },
    ];
    if (dockerBin && composeFile) {
      options.push({
        value: "docker",
        label: cliTFor(locale, "engine.dockerOption"),
        hint: cliTFor(locale, "engine.advancedHint"),
      });
    }
    options.push({ value: "manual", label: cliTFor(locale, "engine.manualOption") });

    const picked = await p.select<Choice>({
      message: cliTFor(locale, "engine.startChoice"),
      options,
      initialValue: "install",
    });
    if (p.isCancel(picked)) {
      startupFailure = { kind: "no-engine" };
      return false;
    }
    choice = picked;
  }

  if (choice === "manual") {
    startupFailure = { kind: "no-engine" };
    return false;
  }

  if (choice === "install") {
    const result = await runIiiInstaller();
    if (result.ok && result.binPath) {
      process.env["PATH"] = `${dirname(result.binPath)}${PATH_DELIMITER}${process.env["PATH"] ?? ""}`;
      iiiBin = result.binPath;
      return startIiiBin(iiiBin, configPath);
    }
    if (dockerBin && composeFile && interactive) {
      const fallback = await p.confirm({
        message: cliTFor(locale, "engine.autoInstallDockerFallback"),
        initialValue: true,
      });
      if (p.isCancel(fallback) || fallback !== true) {
        startupFailure = { kind: "no-engine" };
        return false;
      }
      choice = "docker";
    } else {
      startupFailure = { kind: "no-engine" };
      return false;
    }
  }

  if (choice === "docker" && dockerBin && composeFile) {
    const s = p.spinner();
    s.start(cliTFor(locale, "engine.startingDocker"));
    writeEngineState({ kind: "docker", composeFile });
    spawnEngineBackground(
      dockerBin,
      ["compose", "-f", composeFile, "up", "-d"],
      "iii-engine via Docker",
    );
    s.stop(cliTFor(locale, "engine.dockerStarted"));
    return true;
  }

  if (!composeFile && dockerBin) {
    startupFailure = { kind: "no-docker-compose" };
  } else {
    startupFailure = { kind: "no-engine" };
  }
  return false;
}

async function waitForEngine(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isEngineRunning()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function installInstructions(locale: Locale = currentCliLocale()): string[] {
  const releaseUrl = iiiReleaseUrl();
  if (IS_WINDOWS) {
    return cliTFor(locale, "engine.installInstructionsWindows", {
      version: IIPINNED_VERSION,
    }).split("\n");
  }
  const manualUrl = `https://github.com/iii-hq/iii/releases/tag/iii%2Fv${IIPINNED_VERSION}`;
  const linuxInstall = releaseUrl
    ? `  A) curl -fsSL "${releaseUrl}" | tar -xz -C ~/.local/bin && chmod +x ~/.local/bin/iii`
    : cliTFor(locale, "engine.manualDownloadLine", { url: manualUrl });
  return cliTFor(locale, "engine.installInstructionsUnix", {
    version: IIPINNED_VERSION,
    linuxInstall,
  }).split("\n");
}

function portInUseDiagnostic(port: number): string {
  return IS_WINDOWS
    ? `  netstat -ano | findstr :${port}`
    : `  lsof -i :${port}   # or: ss -tlnp | grep :${port}`;
}

async function waitForAgentmemoryReady(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isAgentmemoryReady()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// Derive a host string for the streams/engine WebSocket lines from
// the configured engine URL (`III_ENGINE_URL`) or REST base
// (`AGENTMEMORY_URL`) so a remote-bind setup like
// `III_ENGINE_URL=ws://my-host:49134` doesn't print misleading
// localhost addresses. Falls back to localhost.
function getEngineHost(): string {
  for (const envKey of ["III_ENGINE_URL", "AGENTMEMORY_URL"]) {
    const raw = process.env[envKey];
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (parsed.hostname) return parsed.hostname;
    } catch {}
  }
  return "localhost";
}

function printReadyHint(consoleState: IiiConsoleState): void {
  const locale = currentCliLocale();
  // REST goes through getBaseUrl which already honors AGENTMEMORY_URL
  // for full host+protocol overrides. Streams/Engine are derived from
  // III_ENGINE_URL so a remote bind reads correctly in the panel.
  const restUrl = getBaseUrl();
  const viewerUrl = getViewerUrl();
  const engineHost = getEngineHost();
  const streamUrl = `ws://${engineHost}:${getStreamPort()}`;
  const engineUrl = `ws://${engineHost}:${getEnginePort()}`;

  const consoleLine =
    consoleState.kind === "installed"
      ? // We can't safely probe iii-console's port (default 3113
        // collides with our viewer) so we surface the binary location
        // and let the user start it on a port of their choice. Use
        // the detected binary path so `(run: ...)` is executable as-
        // is, even when the binary isn't on PATH under the bare
        // name `iii-console`.
        `iii console  ${consoleState.binPath}  (run: ${consoleState.binPath} -p <port>)`
      : `iii console  (install: ${III_CONSOLE_INSTALL_CMD})`;

  const lines = [
    `REST API     ${restUrl}`,
    `Viewer       ${viewerUrl}`,
    `Streams      ${streamUrl}`,
    `Engine       ${engineUrl}`,
    consoleLine,
  ];
  // p.note renders a bordered panel with a title — same affordance
  // used elsewhere in this CLI for "Troubleshooting" / "Setup
  // required" blocks, so the visual language stays consistent.
  p.note(lines.join("\n"), `agentmemory v${VERSION}`);

  // Pick a runnable form for the suggested next-step. Users invoked
  // via `npx` don't have the bare `agentmemory` command on PATH yet
  // (unless they accepted the global-install prompt and the npm bin
  // dir was already on PATH in this shell), so we suggest the npx
  // form for them; everyone else gets the global form.
  const demoCommand = isInvokedViaNpx()
    ? "npx @agentmemory/agentmemory demo"
    : "agentmemory demo";
  process.stdout.write(`\n${cliTFor(locale, "engine.tryDemo", { command: demoCommand })}\n`);
}

async function main() {
  const locale = currentCliLocale();
  // `--reset` wipes preferences before anything else so the onboarding
  // flow below always runs fresh.
  if (IS_RESET) {
    resetPrefs();
  }

  const firstRun = isFirstRun();
  const prefs = readPrefs();
  // Show the splash on the first run, on --reset, or whenever the user
  // hasn't yet opted out via the schema (we set `skipSplash: true`
  // after onboarding completes). Verbose runs always splash since the
  // user explicitly asked for the chatty experience.
  if (firstRun || IS_RESET || IS_VERBOSE || !prefs.skipSplash) {
    renderSplash(VERSION);
  }

  if (firstRun || IS_RESET) {
    await runOnboarding();
  }

  if (skipEngine) {
    if (IS_VERBOSE) p.log.info(cliTFor(locale, "engine.skipCheck"));
    await import("./index.js");
    if (await waitForAgentmemoryReady(15000)) {
      const consoleState = await ensureIiiConsole();
      await maybeOfferGlobalInstall();
      printReadyHint(consoleState);
    }
    return;
  }

  if (await isEngineRunning()) {
    if (IS_VERBOSE) p.log.success(cliTFor(locale, "engine.running"));
    const attachedBin =
      whichBinary("iii") ?? fallbackIiiPaths().find((p) => existsSync(p)) ?? null;
    warnIfEngineVersionMismatch(attachedBin);
    adoptRunningEngine();
    await import("./index.js");
    if (await waitForAgentmemoryReady(15000)) {
      const consoleState = await ensureIiiConsole();
      await maybeOfferGlobalInstall();
      printReadyHint(consoleState);
    }
    return;
  }

  const started = await startEngine();
  if (!started) {
    p.log.error(cliTFor(locale, "engine.startFailed"));
    const lines = installInstructions(locale);
    if (startupFailure?.kind === "no-docker-compose") {
      lines.unshift(
        cliTFor(locale, "engine.dockerComposeMissingLine1"),
        cliTFor(locale, "engine.dockerComposeMissingLine2"),
        "",
      );
    }
    p.note(lines.join("\n"), cliTFor(locale, "engine.setupRequiredTitle"));
    process.exit(1);
  }

  const s = p.spinner();
  s.start(cliTFor(locale, "engine.waiting"));

  const ready = await waitForEngine(15000);
  if (!ready) {
    const port = getRestPort();
    s.stop(cliTFor(locale, "engine.notReady"));

    if (startupFailure?.kind === "engine-crashed" || startupFailure?.kind === "docker-crashed") {
      p.log.error(cliTFor(locale, "engine.crashed"));
      if (startupFailure.binary) {
        p.log.info(cliTFor(locale, "engine.binary", { path: startupFailure.binary }));
      }
      if (startupFailure.stderr) {
        p.note(startupFailure.stderr, cliTFor(locale, "engine.stderrTitle"));
      } else {
        p.log.info(cliTFor(locale, "engine.noStderr"));
      }
      p.note(
        cliTFor(locale, "engine.commonCauses"),
        cliTFor(locale, "engine.troubleshootingTitle"),
      );
    } else {
      p.log.error(cliTFor(locale, "engine.restNeverResponded"));
      p.note(
        cliTFor(locale, "engine.restTroubleshooting", {
          port,
          diagnostic: portInUseDiagnostic(port),
        }),
        cliTFor(locale, "engine.troubleshootingTitle"),
      );
    }
    process.exit(1);
  }

  s.stop(cliTFor(locale, "engine.ready"));
  await import("./index.js");
  if (await waitForAgentmemoryReady(15000)) {
    const consoleState = await ensureIiiConsole();
    await maybeOfferGlobalInstall();
    printReadyHint(consoleState);
  }
  // Mark splash as something to skip on subsequent runs. This is a
  // no-op if onboarding already flipped the flag (idempotent merge).
  writePrefs({ skipSplash: true });
}

async function apiFetch<T = unknown>(base: string, path: string, timeoutMs = 5000): Promise<T | null> {
  try {
    const headers: Record<string, string> = {};
    const secret = process.env["AGENTMEMORY_SECRET"];
    if (secret) headers["Authorization"] = `Bearer ${secret}`;
    const res = await fetch(`${base}/agentmemory/${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers,
    });
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function runStatus() {
  const base = getBaseUrl();
  const locale = currentCliLocale();
  p.intro(cliTFor(locale, "status.intro"));

  const up = await isEngineRunning();
  if (!up) {
    p.log.error(cliTFor(locale, "status.notRunning", { base }));
    p.log.info(cliTFor(locale, "common.startWith"));
    process.exit(1);
  }

  try {
    const [healthRes, sessionsRes, graphRes, memoriesRes, flagsRes] = await Promise.all([
      apiFetch<any>(base, "health"),
      apiFetch<any>(base, "sessions"),
      apiFetch<any>(base, "graph/stats"),
      apiFetch<any>(base, "memories?count=true"),
      apiFetch<any>(base, "config/flags"),
    ]);

    if (typeof healthRes?.viewerPort === "number") {
      discoveredViewerPort = healthRes.viewerPort;
    }
    const h = healthRes?.health;
    const status = healthRes?.status || "unknown";
    const version = healthRes?.version || "?";
    const sessionRows = Array.isArray(sessionsRes?.sessions) ? sessionsRes.sessions : [];
    const sessions = sessionRows.length;
    const nodes = Number(graphRes?.totalNodes ?? graphRes?.nodes ?? graphRes?.nodeCount ?? 0);
    const edges = Number(graphRes?.totalEdges ?? graphRes?.edges ?? graphRes?.edgeCount ?? 0);
    const cb = healthRes?.circuitBreaker?.state || "closed";
    const heapMB = h?.memory ? Math.round(h.memory.heapUsed / 1048576) : 0;
    const uptime = h?.uptimeSeconds ? Math.round(h.uptimeSeconds) : 0;

    const obsCount = sessionRows.reduce(
      (sum: number, session: { observationCount?: unknown }) =>
        sum + (typeof session.observationCount === "number" ? session.observationCount : 0),
      0,
    );
    const memCount = Number(memoriesRes?.latestCount ?? memoriesRes?.total ?? 0);
    const estFullTokens = obsCount * 80;
    const estInjectedTokens = Math.min(obsCount, 50) * 38;
    const tokensSaved = estFullTokens - estInjectedTokens;
    const pctSaved = estFullTokens > 0 ? Math.round((tokensSaved / estFullTokens) * 100) : 0;

    p.log.success(cliTFor(locale, "status.connected", { version, base }));

    const lines = [
      `${cliTFor(locale, "status.health")}:       ${status === "healthy" ? cliTFor(locale, "status.healthy") : status}`,
      `${cliTFor(locale, "status.sessions")}:     ${sessions}`,
      `${cliTFor(locale, "status.observations")}: ${obsCount}`,
      `${cliTFor(locale, "status.memories")}:     ${memCount}`,
      `${cliTFor(locale, "status.graph")}:        ${nodes} nodes, ${edges} edges`,
      `${cliTFor(locale, "status.circuit")}:      ${cb}`,
      `${cliTFor(locale, "status.heap")}:         ${heapMB} MB`,
      `${cliTFor(locale, "status.uptime")}:       ${uptime}s`,
      `${cliTFor(locale, "status.viewer")}:       ${getViewerUrl()}`,
    ];

    if (obsCount > 0) {
      lines.push("");
      lines.push(cliTFor(locale, "status.tokenSavings", {
        tokens: tokensSaved.toLocaleString(),
        percent: pctSaved,
      }));
      lines.push(`  ${cliTFor(locale, "status.fullContext")}: ~${estFullTokens.toLocaleString()} tokens`);
      lines.push(`  ${cliTFor(locale, "status.injected")}:     ~${estInjectedTokens.toLocaleString()} tokens`);
    }

    if (flagsRes) {
      const provider = flagsRes.provider === "llm" ? "✓ llm" : cliTFor(locale, "status.noopProvider");
      const embed = flagsRes.embeddingProvider === "embeddings" ? "✓ embeddings" : "bm25-only";
      const flagRows = (flagsRes.flags || []).map((f: { key: string; enabled: boolean; label: string }) =>
        `  ${f.enabled ? "✓" : "✗"} ${f.key.padEnd(32)} ${f.label}`
      );
      lines.push("");
      lines.push(`${cliTFor(locale, "status.provider")}:     ${provider}`);
      lines.push(`${cliTFor(locale, "status.embeddings")}:   ${embed}`);
      lines.push(`${cliTFor(locale, "status.flags")}:`);
      flagRows.forEach((r: string) => lines.push(r));
    }

    p.note(lines.join("\n"), "agentmemory");
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

type DoctorCheck = { name: string; ok: boolean; hint?: string };

function formatChecks(checks: DoctorCheck[]): string {
  return checks
    .map((c) => `${c.ok ? "✓" : "✗"} ${c.name}${c.hint ? `\n   ${c.hint}` : ""}`)
    .join("\n");
}

type CCHooksCheck =
  | { state: "loaded"; manifestPath?: string }
  | { state: "not-loaded" }
  | { state: "no-debug-log" }
  | { state: "no-cc-dir" };

function findLatestDebugLog(debugDir: string): string | undefined {
  const latestLink = join(debugDir, "latest");
  try {
    if (existsSync(latestLink)) {
      const target = readlinkSync(latestLink);
      const resolved = target.startsWith("/") ? target : join(debugDir, target);
      if (existsSync(resolved)) return resolved;
    }
  } catch {}

  try {
    const newest = readdirSync(debugDir)
      .filter((f) => f.endsWith(".txt"))
      .map((f) => ({ f, m: statSync(join(debugDir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)[0];
    if (newest) return join(debugDir, newest.f);
  } catch {}

  return undefined;
}

function checkClaudeCodeHooks(): CCHooksCheck {
  const debugDir = join(homedir(), ".claude", "debug");
  if (!existsSync(debugDir)) return { state: "no-cc-dir" };

  const logPath = findLatestDebugLog(debugDir);
  if (!logPath) return { state: "no-debug-log" };

  let content: string;
  try {
    content = readFileSync(logPath, "utf8");
  } catch {
    return { state: "no-debug-log" };
  }

  const match = content.match(
    /Loaded hooks from standard location for plugin agentmemory:\s*(\S+)/
  );
  if (match) return { state: "loaded", manifestPath: match[1] };
  if (content.includes("Loading hooks from plugin: agentmemory")) return { state: "loaded" };
  return { state: "not-loaded" };
}

// ---------------------------------------------------------------------------
// Doctor v2 — interactive fixer.
//
// The legacy passive check-list (server reachable, flags, knowledge-graph,
// Claude Code hooks) still runs first as an informational summary because
// those checks need a live engine and don't have a one-shot inline fix.
// Then we drive the new diagnostic catalog (see src/cli/doctor-diagnostics.ts)
// which prompts Fix/Skip/More/Quit per failing check, applies the fix
// inline, and re-checks only the affected diagnostic.

function buildDoctorContext(): DoctorContext {
  return {
    baseUrl: getBaseUrl(),
    viewerUrl: getViewerUrl(),
    envPath: join(homedir(), ".agentmemory", ".env"),
    pidfilePath: enginePidfilePath(),
    enginePath: engineStatePath(),
    pinnedVersion: IIPINNED_VERSION,
  };
}

function buildDoctorEffects(): DoctorEffects {
  return {
    envFileExists: () => existsSync(join(homedir(), ".agentmemory", ".env")),
    readEnvFile: () => {
      try {
        return parseEnvFile(
          readFileSync(join(homedir(), ".agentmemory", ".env"), "utf-8"),
        );
      } catch {
        return {};
      }
    },
    pidfileExists: () => existsSync(enginePidfilePath()),
    pidfilePidIsAlive: () => {
      const pid = readEnginePidfile();
      if (pid === null) return null;
      return pidAlive(pid);
    },
    findIiiBinary: () => whichBinary("iii"),
    localBinIiiPath: () => join(homedir(), ".local", "bin", IS_WINDOWS ? "iii.exe" : "iii"),
    iiiBinaryVersion: (binPath: string) => iiiBinVersion(binPath),
    viewerReachable: async (timeoutMs = 2000) => {
      try {
        await discoverViewerPort();
        const res = await fetch(getViewerUrl(), {
          signal: AbortSignal.timeout(timeoutMs),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    runInit: async () => {
      const locale = currentCliLocale();
      try {
        await runInit();
        return { ok: true, message: cliTFor(locale, "doctorEffects.wroteEnv") };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
    openEditor: async (path: string) => {
      const locale = currentCliLocale();
      const editor = process.env["EDITOR"] || process.env["VISUAL"] || "nano";
      p.log.info(cliTFor(locale, "doctorEffects.openingEditor", { path, editor }));
      try {
        // Inherit stdio so the user actually sees the editor.
        const result = spawnSync(editor, [path], { stdio: "inherit" });
        if (result.error) {
          return {
            ok: false,
            message: cliTFor(locale, "doctorEffects.launchFailed", {
              editor,
              message: result.error.message,
            }),
          };
        }
        if ((result.status ?? 0) !== 0) {
          return {
            ok: false,
            message: cliTFor(locale, "doctorEffects.editorExited", {
              editor,
              code: result.status ?? "unknown",
            }),
          };
        }
        return { ok: true, message: cliTFor(locale, "doctorEffects.savedPath", { path }) };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
    runIiiInstaller: async () => {
      const locale = currentCliLocale();
      const r = await runIiiInstaller();
      return {
        ok: r.ok,
        message: r.ok
          ? cliTFor(locale, "doctorEffects.installedIii", {
              version: IIPINNED_VERSION,
              path: r.binPath,
            })
          : cliTFor(locale, "doctorEffects.iiiInstallerFailed"),
      };
    },
    runStop: async () => {
      const locale = currentCliLocale();
      try {
        // runStop calls process.exit on its own — guard against that here
        // by short-circuiting when there's nothing to stop.
        const port = getRestPort();
        const portPids = findEnginePidsByPort(port);
        const pidfilePid = readEnginePidfile();
        if (portPids.length === 0 && pidfilePid === null) {
          clearEnginePidfile();
          clearEngineState();
          return { ok: true, message: cliTFor(locale, "doctorEffects.nothingToStop") };
        }
        const candidates = new Set<number>();
        if (pidfilePid) candidates.add(pidfilePid);
        for (const pid of portPids) candidates.add(pid);
        let allStopped = true;
        for (const pid of candidates) {
          const ok = await signalAndWait(pid, "SIGTERM", 3000);
          if (!ok) allStopped = false;
        }
        clearEnginePidfile();
        clearEngineState();
        return {
          ok: allStopped,
          message: allStopped
            ? cliTFor(locale, "doctorEffects.engineStopped")
            : cliTFor(locale, "doctorEffects.enginePidsSurvived"),
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
    runStart: async () => {
      const locale = currentCliLocale();
      try {
        const started = await startEngine();
        if (!started) {
          return { ok: false, message: cliTFor(locale, "doctorEffects.startReturnedFalse") };
        }
        const ready = await waitForEngine(15000);
        return {
          ok: ready,
          message: ready
            ? cliTFor(locale, "doctorEffects.engineReady")
            : cliTFor(locale, "doctorEffects.engineNotReady"),
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
    clearEnginePidAndState: () => {
      clearEnginePidfile();
      clearEngineState();
    },
  };
}

async function passiveServerChecks(locale: Locale = currentCliLocale()): Promise<DoctorCheck[]> {
  const base = getBaseUrl();
  const checks: DoctorCheck[] = [];

  const serverUp = await isEngineRunning();
  checks.push({
    name: cliTFor(locale, "doctor.serverReachable"),
    ok: serverUp,
    hint: serverUp
      ? undefined
      : cliTFor(locale, "doctor.serverStartHint", { base }),
  });
  if (!serverUp) return checks;

  const [health, flags, graph] = await Promise.all([
    apiFetch<any>(base, "health", 3000),
    apiFetch<any>(base, "config/flags", 3000),
    apiFetch<any>(base, "graph/stats", 3000),
  ]);

  const hasLlm = flags?.provider === "llm";
  const hasEmbed = flags?.embeddingProvider === "embeddings";
  const graphNodeCount = Number(
    graph?.totalNodes ?? graph?.nodes ?? graph?.nodeCount ?? 0,
  );
  const graphHas = graphNodeCount > 0;

  checks.push(
    {
      name: cliTFor(locale, "doctor.healthStatus"),
      ok: health?.status === "healthy",
      hint:
        health?.status === "healthy"
          ? undefined
          : cliTFor(locale, "doctor.statusHint", { status: health?.status || "unknown" }),
    },
    {
      name: cliTFor(locale, "doctor.llmProvider"),
      ok: hasLlm,
      hint: hasLlm ? undefined : cliTFor(locale, "doctor.llmProviderHint"),
    },
    {
      name: cliTFor(locale, "doctor.embeddingProvider"),
      ok: hasEmbed,
      hint: hasEmbed
        ? undefined
        : cliTFor(locale, "doctor.embeddingProviderHint"),
    },
  );

  for (const f of (flags?.flags || []) as {
    label: string;
    enabled: boolean;
    enableHow: string;
  }[]) {
    checks.push({
      name: f.label,
      ok: f.enabled,
      hint: f.enabled ? undefined : f.enableHow,
    });
  }

  const cc = checkClaudeCodeHooks();
  const ccCheck = (() => {
    switch (cc.state) {
      case "loaded":
        return {
          ok: true,
          hint: cc.manifestPath ? `manifest: ${cc.manifestPath}` : undefined,
        };
      case "not-loaded":
        return {
          ok: false,
          hint: cliTFor(locale, "doctor.ccHooksNotLoaded"),
        };
      case "no-debug-log":
        return {
          ok: false,
          hint: cliTFor(locale, "doctor.ccNoDebugLog"),
        };
      case "no-cc-dir":
        return undefined;
    }
  })();
  if (ccCheck) checks.push({ name: cliTFor(locale, "doctor.ccHooksRegistered"), ...ccCheck });

  checks.push({
    name: cliTFor(locale, "doctor.graphPopulated"),
    ok: graphHas,
    hint: graphHas
      ? undefined
      : cliTFor(locale, "doctor.graphEmptyHint"),
  });

  return checks;
}

type DoctorAction = "fix" | "skip" | "more" | "quit";

async function askFixAction(d: Diagnostic): Promise<DoctorAction> {
  const locale = currentCliLocale();
  const choice = await p.select<DoctorAction>({
    message: `[${d.id}] ${d.message}`,
    options: [
      { value: "fix", label: cliTFor(locale, "doctor.fix"), hint: d.fixPreview },
      { value: "skip", label: cliTFor(locale, "doctor.skip") },
      { value: "more", label: cliTFor(locale, "doctor.more") },
      { value: "quit", label: cliTFor(locale, "doctor.quit") },
    ],
    initialValue: "fix",
  });
  if (p.isCancel(choice)) return "quit";
  return choice;
}

async function applyFixWithReport(
  d: Diagnostic,
  ctx: DoctorContext,
  dryRun: boolean,
): Promise<DiagnosticFixResult> {
  if (dryRun) {
    p.log.info(cliT("doctor.dryRunWould", { preview: d.fixPreview }));
    return { ok: true, message: "(dry-run)" };
  }
  const result = await d.fix(ctx);
  if (result.ok) {
    p.log.success(result.message ?? `${d.id} fixed.`);
  } else {
    p.log.error(result.message ?? `${d.id} fix failed.`);
  }
  return result;
}

async function runDoctor() {
  const locale = currentCliLocale();
  p.intro(cliTFor(locale, "doctor.intro"));
  const applyAll = args.includes("--all");
  const dryRun = args.includes("--dry-run");
  if (applyAll && dryRun) {
    p.log.error(cliTFor(locale, "doctor.cannotAllDryRun"));
    process.exit(2);
  }

  // Passive server checks (informational).
  const passive = await passiveServerChecks(locale);
  const passivePassed = passive.filter((c) => c.ok).length;
  p.note(
    formatChecks(passive),
    cliTFor(locale, "doctor.serverSummary", {
      passed: passivePassed,
      total: passive.length,
    }),
  );

  // Doctor v2 interactive catalog.
  const ctx = buildDoctorContext();
  const effects = buildDoctorEffects();
  const diagnostics = buildDiagnostics(effects, locale);

  if (dryRun) {
    const results: Array<{ diagnostic: Diagnostic; status: { ok: boolean; detail?: string } }> = [];
    for (const d of diagnostics) results.push({ diagnostic: d, status: await d.check(ctx) });
    const lines = dryRunPlan(ctx, results, locale);
    p.note(lines.join("\n"), cliTFor(locale, "doctor.dryRunPlan"));
    p.outro(cliTFor(locale, "doctor.dryRunComplete"));
    return;
  }

  let failed = 0;
  let fixed = 0;
  let skipped = 0;
  let quit = false;

  for (const d of diagnostics) {
    if (quit) {
      skipped++;
      continue;
    }
    const status = await d.check(ctx);
    if (status.ok) {
      p.log.success(`${d.id} ✓${status.detail ? ` (${status.detail})` : ""}`);
      continue;
    }
    failed++;
    p.log.warn(`${d.id} ✗ ${status.detail ?? ""}`.trim());
    p.log.info(cliTFor(locale, "doctor.why", { preview: d.fixPreview }));

    if (d.manualOnly) {
      p.log.info(cliTFor(locale, "doctor.manualOnly", { id: d.id }));
    }

    if (applyAll) {
      const r = await applyFixWithReport(d, ctx, false);
      if (r.ok) fixed++;
      // Re-check only this diagnostic.
      const after = await d.check(ctx);
      if (!after.ok) p.log.warn(cliTFor(locale, "doctor.stillFailing", { id: d.id }));
      continue;
    }

    // Interactive prompt loop — allow [?] More info without leaving the check.
    while (true) {
      const action = await askFixAction(d);
      if (action === "fix") {
        const r = await applyFixWithReport(d, ctx, false);
        if (r.ok) {
          const after = await d.check(ctx);
          if (after.ok) {
            fixed++;
          } else {
            p.log.warn(cliTFor(locale, "doctor.stillFailingDetail", {
              id: d.id,
              detail: after.detail ?? "",
            }));
          }
        }
        break;
      }
      if (action === "skip") {
        skipped++;
        break;
      }
      if (action === "more") {
        p.note(d.moreInfo, `[${d.id}] more info`);
        continue;
      }
      if (action === "quit") {
        quit = true;
        break;
      }
    }
  }

  const summary = cliTFor(locale, "doctor.summary", {
    total: diagnostics.length,
    failed,
    fixed,
    skipped,
  });
  if (quit) {
    p.outro(cliTFor(locale, "doctor.quitEarly", { summary }));
    process.exit(1);
  }
  if (failed === 0) {
    p.outro(cliTFor(locale, "doctor.allPassing"));
    return;
  }
  if (failed - fixed === 0) {
    p.outro(cliTFor(locale, "doctor.allFixesApplied", { summary }));
    return;
  }
  p.outro(summary);
  process.exit(1);
}

type DemoObservation = {
  toolName: string;
  toolInput: Record<string, string>;
  toolOutput: string;
};

type DemoSession = {
  id: string;
  title: string;
  observations: DemoObservation[];
};

type SearchResult = { query: string; hits: number; topTitle: string };

function buildDemoSessions(locale: Locale = "en"): DemoSession[] {
  if (locale === "zh-CN") {
    return [
      {
        id: generateId("demo"),
        title: "会话 1: JWT auth setup",
        observations: [
          {
            toolName: "Write",
            toolInput: { file_path: "src/middleware/auth.ts" },
            toolOutput:
              "使用 jose library 创建了 JWT middleware。Tokens 30 天后过期。为了 Edge compatibility，选择 jose 而不是 jsonwebtoken。",
          },
          {
            toolName: "Write",
            toolInput: { file_path: "test/auth.test.ts" },
            toolOutput:
              "添加了 token validation tests，覆盖 expired、malformed 和 valid cases。",
          },
          {
            toolName: "Bash",
            toolInput: { command: "npm test" },
            toolOutput: "全部 12 个 auth tests 通过。",
          },
        ],
      },
      {
        id: generateId("demo"),
        title: "会话 2: Database migration debugging",
        observations: [
          {
            toolName: "Read",
            toolInput: { file_path: "prisma/schema.prisma" },
            toolOutput:
              "发现 user relations 中存在 N+1 query 问题。需要在 posts query 上添加 include。",
          },
          {
            toolName: "Edit",
            toolInput: { file_path: "src/api/users.ts" },
            toolOutput:
              "通过添加 Prisma include 修复 N+1。Query time 从 450ms 降到 28ms。",
          },
        ],
      },
      {
        id: generateId("demo"),
        title: "会话 3: Rate limiting",
        observations: [
          {
            toolName: "Write",
            toolInput: { file_path: "src/middleware/ratelimit.ts" },
            toolOutput:
              "添加了 rate limiting middleware，默认 100 req/min。开发环境使用 in-memory store，生产环境使用 Redis。",
          },
        ],
      },
    ];
  }

  return [
    {
      id: generateId("demo"),
      title: "Session 1: JWT auth setup",
      observations: [
        {
          toolName: "Write",
          toolInput: { file_path: "src/middleware/auth.ts" },
          toolOutput:
            "Created JWT middleware using jose library. Tokens expire after 30 days. Chose jose over jsonwebtoken for Edge compatibility.",
        },
        {
          toolName: "Write",
          toolInput: { file_path: "test/auth.test.ts" },
          toolOutput:
            "Added token validation tests covering expired, malformed, and valid cases.",
        },
        {
          toolName: "Bash",
          toolInput: { command: "npm test" },
          toolOutput: "All 12 auth tests passing.",
        },
      ],
    },
    {
      id: generateId("demo"),
      title: "Session 2: Database migration debugging",
      observations: [
        {
          toolName: "Read",
          toolInput: { file_path: "prisma/schema.prisma" },
          toolOutput:
            "Found N+1 query issue in user relations. Need to add include on posts query.",
        },
        {
          toolName: "Edit",
          toolInput: { file_path: "src/api/users.ts" },
          toolOutput:
            "Fixed N+1 by adding Prisma include. Query time dropped from 450ms to 28ms.",
        },
      ],
    },
    {
      id: generateId("demo"),
      title: "Session 3: Rate limiting",
      observations: [
        {
          toolName: "Write",
          toolInput: { file_path: "src/middleware/ratelimit.ts" },
          toolOutput:
            "Added rate limiting middleware with 100 req/min default. Uses in-memory store for dev, Redis for prod.",
        },
      ],
    },
  ];
}

async function postJson<T = unknown>(
  url: string,
  body: unknown,
  timeoutMs = 5000,
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

async function postJsonStrict<T = unknown>(
  url: string,
  body: unknown,
  timeoutMs = 5000,
): Promise<T | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const suffix = errBody ? ` — ${errBody.slice(0, 200)}` : "";
    throw new Error(`POST ${url} failed: ${res.status} ${res.statusText}${suffix}`);
  }
  return (await res.json().catch(() => null)) as T | null;
}

async function seedDemoSession(
  base: string,
  project: string,
  session: DemoSession,
): Promise<number> {
  await postJsonStrict(`${base}/agentmemory/session/start`, {
    sessionId: session.id,
    project,
    cwd: project,
  });

  let stored = 0;
  for (const obs of session.observations) {
    const url = `${base}/agentmemory/observe`;
    const payload = {
      hookType: "post_tool_use",
      sessionId: session.id,
      project,
      cwd: project,
      timestamp: new Date().toISOString(),
      data: {
        tool_name: obs.toolName,
        tool_input: obs.toolInput,
        tool_output: obs.toolOutput,
      },
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        stored++;
      } else {
        const body = await res.text().catch(() => "");
        p.log.warn(
          `observe failed for ${obs.toolName}: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 160)}` : ""}`,
        );
      }
    } catch (err) {
      p.log.warn(
        `observe request failed for ${obs.toolName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await postJsonStrict(`${base}/agentmemory/session/end`, { sessionId: session.id });
  return stored;
}

async function runDemoSearch(base: string, query: string): Promise<SearchResult> {
  const data = await postJson<{ results?: Array<{ title?: string }> }>(
    `${base}/agentmemory/smart-search`,
    { query, limit: 5 },
    10000,
  );
  const items = data?.results ?? [];
  return {
    query,
    hits: items.length,
    topTitle: items[0]?.title ?? "(no results)",
  };
}

// Prefer the packaged `.env.example` (next to `dist/cli.mjs`); fall back to
// the repo root when running from a source checkout.
function findEnvExample(): string | null {
  const candidates = [
    join(__dirname, "..", ".env.example"),
    join(__dirname, ".env.example"),
    join(process.cwd(), ".env.example"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

async function runInit() {
  const locale = currentCliLocale();
  p.intro(cliTFor(locale, "init.intro"));
  const target = join(homedir(), ".agentmemory", ".env");
  const template = findEnvExample();
  if (!template) {
    p.log.error(cliTFor(locale, "init.missingTemplate"));
    process.exit(1);
  }
  const dir = dirname(target);
  const { mkdir, copyFile } = await import("node:fs/promises");
  const { constants: fsConstants } = await import("node:fs");
  try {
    await mkdir(dir, { recursive: true });
    // COPYFILE_EXCL collapses the exists-check + copy into one syscall —
    // an existsSync(target) + copyFile() pair races with a parallel init
    // (or any other process touching ~/.agentmemory/.env between the two
    // calls) and would silently overwrite a config the operator just
    // wrote. EEXIST out of copyFile is the only "already configured"
    // signal we trust.
    await copyFile(template, target, fsConstants.COPYFILE_EXCL);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "EEXIST") {
      p.log.warn(cliTFor(locale, "init.alreadyExists", { target }));
      p.log.info(cliTFor(locale, "init.compareTemplate", { target, template }));
      p.outro(cliTFor(locale, "common.nothingChanged"));
      return;
    }
    p.log.error(cliTFor(locale, "init.copyFailed", {
      message: err instanceof Error ? err.message : String(err),
    }));
    process.exit(1);
  }
  p.log.success(cliTFor(locale, "init.wrote", { target }));
  p.note(cliTFor(locale, "init.note"), cliTFor(locale, "init.noteTitle"));
  p.outro(cliTFor(locale, "init.outro", { target }));
}

async function runDemo() {
  const locale = currentCliLocale();
  const port = getRestPort();
  const base = `http://localhost:${port}`;
  p.intro(cliTFor(locale, "demo.intro"));

  if (!(await isAgentmemoryReady())) {
    p.log.error(cliTFor(locale, "demo.notReachable", { port }));
    p.log.info(cliTFor(locale, "common.startWith"));
    process.exit(1);
  }

  const demoProject = "/tmp/agentmemory-demo";
  const sessions = buildDemoSessions(locale);

  const sSeed = p.spinner();
  sSeed.start(cliTFor(locale, "demo.seedStart"));

  let totalObs = 0;
  for (const session of sessions) {
    totalObs += await seedDemoSession(base, demoProject, session);
  }

  sSeed.stop(cliTFor(locale, "demo.seedStop", {
    total: totalObs,
    sessions: sessions.length,
  }));

  const queries = [
    "jwt auth middleware",
    "database performance optimization",
    "rate limiting",
  ];

  const sQuery = p.spinner();
  sQuery.start(cliTFor(locale, "demo.queryStart", { count: queries.length }));

  const results: SearchResult[] = [];
  for (const query of queries) {
    results.push(await runDemoSearch(base, query));
  }

  sQuery.stop(cliTFor(locale, "demo.queryStop"));

  const lines = [
    `${cliTFor(locale, "demo.project")}:       ${demoProject}`,
    `${cliTFor(locale, "demo.sessions")}:      ${cliTFor(locale, "demo.sessionSummary", {
      sessions: sessions.length,
      observations: totalObs,
    })}`,
    "",
    `${cliTFor(locale, "demo.searchResults")}:`,
    ...results.flatMap((r) => [
      `  "${r.query}"`,
      cliTFor(locale, "demo.hitLine", {
        hits: r.hits,
        title: r.topTitle.slice(0, 60),
      }),
    ]),
    "",
    cliTFor(locale, "demo.notice"),
    cliTFor(locale, "demo.noticeDetail"),
    "",
    `${cliTFor(locale, "demo.viewer")}:        ${getViewerUrl()}`,
    `${cliTFor(locale, "demo.cleanup")}: curl -X DELETE "${base}/agentmemory/sessions?project=${demoProject}"`,
  ];

  p.note(lines.join("\n"), cliTFor(locale, "demo.noteTitle"));
  p.log.success(cliTFor(locale, "demo.success"));
}

function runCommand(
  command: string,
  commandArgs: string[],
  options: { cwd?: string; label: string; optional?: boolean } = {
    label: cliT("command.defaultLabel"),
  },
): boolean {
  const locale = currentCliLocale();
  const spinner = p.spinner();
  spinner.start(options.label);
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || process.cwd(),
    stdio: "pipe",
    encoding: "utf-8",
  });

  if (result.status === 0) {
    spinner.stop(`${options.label} ✓`);
    return true;
  }

  const stderr = (result.stderr || "").toString().trim();
  const stdout = (result.stdout || "").toString().trim();
  const msg = stderr || stdout || cliTFor(locale, "command.unknownError");

  if (options.optional) {
    spinner.stop(`${options.label} (${cliTFor(locale, "command.skippedSuffix")})`);
    p.log.warn(msg.slice(0, 300));
    return false;
  }

  spinner.stop(`${options.label} ✗`);
  p.log.error(msg.slice(0, 300));
  return false;
}

async function runUpgrade() {
  const locale = currentCliLocale();
  p.intro(cliTFor(locale, "upgrade.intro"));

  const cwd = process.cwd();
  const hasPackageJson = existsSync(join(cwd, "package.json"));
  const hasPnpmLock = existsSync(join(cwd, "pnpm-lock.yaml"));

  const pnpmBin = whichBinary("pnpm");
  const npmBin = whichBinary("npm");
  const dockerBin = whichBinary("docker");

  p.log.info(cliTFor(locale, "upgrade.workingDirectory", { cwd }));
  const requireSuccess = (ok: boolean, label: string): void => {
    if (!ok) {
      p.log.error(cliTFor(locale, "upgrade.aborted", { label }));
      process.exit(1);
    }
  };

  if (hasPackageJson) {
    const usePnpm = !!pnpmBin && hasPnpmLock;
    if (usePnpm && pnpmBin) {
      const installOk = runCommand(pnpmBin, ["install"], {
        label: cliTFor(locale, "upgrade.refreshDependenciesPnpm"),
      });
      requireSuccess(installOk, "pnpm install");
      runCommand(pnpmBin, ["up", "iii-sdk@0.11.2"], {
        label: cliTFor(locale, "upgrade.pinningIiiSdk"),
        optional: true,
      });
    } else if (npmBin) {
      const installOk = runCommand(npmBin, ["install"], {
        label: cliTFor(locale, "upgrade.refreshDependenciesNpm"),
      });
      requireSuccess(installOk, "npm install");
      runCommand(npmBin, ["install", "iii-sdk@0.11.2"], {
        label: cliTFor(locale, "upgrade.pinningIiiSdk"),
        optional: true,
      });
    } else {
      p.log.warn(cliTFor(locale, "upgrade.noPackageManager"));
    }
  } else {
    p.log.warn(cliTFor(locale, "upgrade.noPackageJson"));
  }

  const upgradeEngine = await p.confirm({
    message: cliTFor(locale, "upgrade.rerunInstaller"),
    initialValue: true,
  });
  if (p.isCancel(upgradeEngine)) {
    p.cancel(cliTFor(locale, "upgrade.cancelled"));
    return process.exit(0);
  }
  if (upgradeEngine === true) {
    await runIiiInstaller();
  } else {
    p.log.info(cliTFor(locale, "upgrade.installerSkipped"));
  }

  if (dockerBin) {
    runCommand(dockerBin, ["pull", `iiidev/iii:${IIPINNED_VERSION}`], {
      label: cliTFor(locale, "upgrade.pullingDockerImage", { version: IIPINNED_VERSION }),
      optional: true,
    });
  } else {
    p.log.info(cliTFor(locale, "upgrade.dockerMissing"));
  }

  p.note(
    cliTFor(locale, "upgrade.note"),
    cliTFor(locale, "upgrade.noteTitle"),
  );
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

async function signalAndWait(
  pid: number,
  initialSignal: NodeJS.Signals,
  timeoutMs: number,
): Promise<boolean> {
  try {
    process.kill(pid, initialSignal);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ESRCH") return true;
    if (code === "EPERM") {
      p.log.warn(cliTFor(currentCliLocale(), "stop.noPermission", { pid }));
      return false;
    }
    vlog(`${initialSignal} ${pid}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!pidAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!pidAlive(pid)) return true;
  try {
    process.kill(pid, "SIGKILL");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ESRCH") return true;
    vlog(`SIGKILL ${pid}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
  await new Promise((r) => setTimeout(r, 200));
  return !pidAlive(pid);
}

function findEnginePidsByPort(port: number): number[] {
  if (IS_WINDOWS) return [];
  const lsof = whichBinary("lsof");
  if (!lsof) return [];
  // -sTCP:LISTEN restricts to listening server sockets only. Without
  // this, lsof also returns client-side PIDs (any process with an
  // active TCP connection to :port), which includes the agentmemory
  // CLI itself thanks to the keep-alive fetch in isEngineRunning().
  // signalAndWait would then SIGKILL its own parent — exit code 137.
  const selfPid = process.pid;
  try {
    const out = execFileSync(lsof, ["-i", `:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out
      .split(/\s+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n !== selfPid);
  } catch (err) {
    vlog(`lsof :${port}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

async function stopDockerEngine(composeFile: string, port: number): Promise<void> {
  const locale = currentCliLocale();
  const dockerBin = whichBinary("docker");
  if (!dockerBin) {
    p.log.error(
      cliTFor(locale, "stop.dockerMissing", { composeFile }),
    );
    process.exit(1);
  }
  if (!existsSync(composeFile)) {
    p.log.error(
      cliTFor(locale, "stop.dockerStateMissing", { composeFile }),
    );
    process.exit(1);
  }
  const ok = runCommand(dockerBin, ["compose", "-f", composeFile, "down"], {
    label: `docker compose -f ${composeFile} down`,
  });
  clearEnginePidfile();
  clearEngineState();
  clearWorkerPidfile();
  if (!ok) {
    p.log.error(
      cliTFor(locale, "stop.dockerDownFailed", { port, composeFile }),
    );
    process.exit(1);
  }
  p.outro(cliTFor(locale, "stop.stopped"));
}

async function runStop(): Promise<void> {
  const locale = currentCliLocale();
  p.intro(cliTFor(locale, "stop.intro"));
  const port = getRestPort();
  const state = readEngineState();
  const running = await isEngineRunning();
  const force = args.includes("--force");

  if (state?.kind === "docker") {
    if (!running) {
      p.log.info(cliTFor(locale, "stop.noEngineOnPort", { port }));
      clearEnginePidfile();
      clearEngineState();
      clearWorkerPidfile();
      p.outro(cliTFor(locale, "stop.nothingToStop"));
      return;
    }
    await stopDockerEngine(state.composeFile, port);
    return;
  }

  const portPids = findEnginePidsByPort(port);
  const pidfilePid = readEnginePidfile();
  // #640 + #474: read the worker pid up front so the engine-down branch
  // can still reap an orphaned worker process (the common failure mode
  // where a wrapper script kept the worker alive across engine restarts).
  const workerPid = readWorkerPidfile();

  if (!running) {
    if (portPids.length === 0 && pidfilePid === null && workerPid === null) {
      clearEnginePidfile();
      clearEngineState();
      clearWorkerPidfile();
      p.outro(cliTFor(locale, "stop.nothingToStop"));
      return;
    }
    if (workerPid !== null && portPids.length === 0 && pidfilePid === null) {
      // Engine already gone but worker is lingering — reap it directly
      // instead of preserving for manual cleanup.
      const s = p.spinner();
      s.start(cliTFor(locale, "stop.stoppingOrphanWorker", { pid: workerPid }));
      const ok = await signalAndWait(workerPid, "SIGTERM", 3000);
      s.stop(ok
        ? cliTFor(locale, "stop.stoppedWorkerPid", { pid: workerPid })
        : cliTFor(locale, "stop.failedWorkerPid", { pid: workerPid }));
      clearEnginePidfile();
      clearEngineState();
      clearWorkerPidfile();
      if (!ok) {
        p.log.error(cliTFor(locale, "stop.workerSurvived", { pid: workerPid }));
        process.exit(1);
      }
      p.outro(cliTFor(locale, "stop.stoppedOrphanWorker"));
      return;
    }
    const survivors = new Set<number>(portPids);
    if (pidfilePid) survivors.add(pidfilePid);
    if (workerPid) survivors.add(workerPid);
    p.log.warn(
      cliTFor(locale, "stop.engineNotRespondingButProcesses", {
        port,
        count: survivors.size,
        pids: [...survivors].join(", "),
      }),
    );
    p.log.info(
      cliTFor(locale, "stop.preservingManualCleanup", {
        pids: [...survivors].join(","),
        diagnostic: IS_WINDOWS ? `netstat -ano | findstr :${port}` : `lsof -i :${port}`,
      }),
    );
    process.exit(1);
  }

  if (!state) {
    const compose = discoverComposeFile();
    if (compose && pidfilePid === null) {
      if (force) {
        p.log.warn(
          cliTFor(locale, "stop.forceBypass", { port }),
        );
      } else {
        p.log.error(
          cliTFor(locale, "stop.stateMissingGuard", { port, composeFile: compose }),
        );
        process.exit(1);
      }
    }
  }

  const candidates = new Set<number>();
  if (pidfilePid) candidates.add(pidfilePid);
  for (const pid of portPids) candidates.add(pid);

  // #640 + #474: stop must also reap the agentmemory worker process
  // (`node dist/index.mjs`). If only the engine is killed, the worker can
  // survive (detached spawn / signal not propagated) and reconnect to the
  // next engine as a duplicate registration. workerPid was read above so
  // the engine-down branch could also reap orphans.
  const workerCandidates = new Set<number>();
  if (workerPid) workerCandidates.add(workerPid);

  if (candidates.size === 0 && workerCandidates.size === 0) {
    p.log.error(
      cliTFor(locale, "stop.couldNotLocate", {
        command: IS_WINDOWS
          ? `netstat -ano | findstr :${port}`
          : `lsof -i :${port} -t | xargs kill -9`,
      }),
    );
    process.exit(1);
  }

  let allStopped = true;
  for (const pid of candidates) {
    const s = p.spinner();
    s.start(cliTFor(locale, "stop.stoppingEngine", { pid }));
    const ok = await signalAndWait(pid, "SIGTERM", 3000);
    s.stop(ok
      ? cliTFor(locale, "stop.stoppedPid", { pid })
      : cliTFor(locale, "stop.failedPid", { pid }));
    if (!ok) allStopped = false;
  }
  for (const pid of workerCandidates) {
    if (candidates.has(pid)) continue;
    const s = p.spinner();
    s.start(cliTFor(locale, "stop.stoppingWorker", { pid }));
    const ok = await signalAndWait(pid, "SIGTERM", 3000);
    s.stop(ok
      ? cliTFor(locale, "stop.stoppedWorkerPid", { pid })
      : cliTFor(locale, "stop.failedWorkerPid", { pid }));
    if (!ok) allStopped = false;
  }

  clearEnginePidfile();
  clearEngineState();
  clearWorkerPidfile();
  if (!allStopped) {
    p.log.error(cliTFor(locale, "stop.processesSurvived"));
    process.exit(1);
  }
  p.outro(cliTFor(locale, "stop.stopped"));
}

async function runMcp(): Promise<void> {
  await import("./mcp/standalone.js");
}

async function runConnectCmd(): Promise<void> {
  const { runConnect } = await import("./cli/connect/index.js");
  await runConnect(args.slice(1));
}

async function runImportJsonl(): Promise<void> {
  const locale = currentCliLocale();
  // Long-form flags that take a value. Their value tokens must be
  // consumed alongside the flag so they don't leak into positional
  // args (e.g. `--port 3112 import-jsonl` would otherwise turn
  // 3112 into pathArg).
  const VALUE_FLAGS = new Set(["--port", "--tools"]);
  let maxFiles: number | undefined;
  const tail = args.slice(1);
  const positional: string[] = [];
  for (let i = 0; i < tail.length; i++) {
    const a = tail[i]!;
    if (a === "--max-files") {
      const raw = tail[i + 1];
      const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
      if (Number.isInteger(parsed) && parsed > 0) {
        maxFiles = parsed;
      } else if (raw !== undefined) {
        p.log.warn(cliTFor(locale, "importJsonl.badMaxFiles", {
          flag: "--max-files",
          value: raw,
        }));
      }
      i++;
      continue;
    }
    if (a.startsWith("--max-files=")) {
      const raw = a.slice("--max-files=".length);
      const parsed = parseInt(raw, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        maxFiles = parsed;
      } else {
        p.log.warn(cliTFor(locale, "importJsonl.badMaxFilesEquals", { value: raw }));
      }
      continue;
    }
    if (VALUE_FLAGS.has(a)) {
      i++;
      continue;
    }
    if (a.startsWith("-")) continue;
    positional.push(a);
  }
  const pathArg = positional[0];

  const port = getRestPort();
  const base = `http://localhost:${port}`;

  let probeOk = false;
  let probeDetail = "";
  try {
    const probe = await fetch(`${base}/agentmemory/livez`, {
      signal: AbortSignal.timeout(2000),
    });
    probeOk = probe.ok;
    if (!probeOk) {
      const probeBody = await probe.text().catch(() => "");
      probeDetail = cliTFor(locale, "importJsonl.probeUnhealthy", {
        status: probe.status,
        body: probeBody ? `: ${probeBody.slice(0, 200)}` : "",
      });
    }
  } catch (err) {
    probeOk = false;
    const msg = err instanceof Error ? err.message : String(err);
    probeDetail = cliTFor(locale, "importJsonl.probeUnreachable", { message: msg });
  }
  if (!probeOk) {
    p.log.error(
      cliTFor(locale, "importJsonl.probeFailed", {
        port,
        detail: probeDetail,
      }),
    );
    process.exit(1);
  }

  const body: Record<string, unknown> = {};
  if (pathArg) body["path"] = pathArg;
  if (maxFiles !== undefined) body["maxFiles"] = maxFiles;

  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env["AGENTMEMORY_SECRET"];
  if (secret) headers["authorization"] = `Bearer ${secret}`;

  p.log.info(cliTFor(locale, "importJsonl.importing", {
    path: pathArg || "~/.claude/projects",
  }));
  const spinner = p.spinner();
  spinner.start(cliTFor(locale, "importJsonl.scanning"));

  try {
    const res = await fetch(`${base}/agentmemory/replay/import-jsonl`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    let json: {
      success?: boolean;
      error?: string;
      imported?: number;
      sessionIds?: string[];
      observations?: number;
      discovered?: number;
      truncated?: boolean;
      traversalCapped?: boolean;
      maxFiles?: number;
      maxFilesUpperBound?: number;
    } = {};
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        spinner.stop(cliTFor(locale, "importJsonl.failed"));
        p.log.error(
          cliTFor(locale, "importJsonl.nonJson", {
            status: res.status,
            body: text.slice(0, 200),
          }),
        );
        process.exit(1);
      }
    }
    if (!res.ok || json.success !== true) {
      spinner.stop(cliTFor(locale, "importJsonl.failed"));
      const detail =
        json.error ||
        (text.length === 0
          ? cliTFor(locale, "importJsonl.emptyResponseBody")
          : json.success === undefined
            ? cliTFor(locale, "importJsonl.missingSuccessField", { status: res.status })
            : `HTTP ${res.status}`);
      if (res.status === 401) {
        p.log.error(
          cliTFor(locale, "importJsonl.secretMismatch", { detail }),
        );
      } else if (res.status === 404) {
        p.log.error(
          cliTFor(locale, "importJsonl.endpointMissing", { detail }),
        );
      } else {
        p.log.error(detail);
      }
      process.exit(1);
    }
    spinner.stop(
      cliTFor(locale, "importJsonl.importedSummary", {
        files: json.imported ?? 0,
        observations: json.observations ?? 0,
        sessions: json.sessionIds?.length || 0,
      }),
    );
    if (json.truncated) {
      const cap = json.maxFiles ?? 200;
      const upper = json.maxFilesUpperBound ?? 1000;
      const discovered = json.discovered ?? 0;
      const skipped = discovered - (json.imported ?? 0);
      const discoveredLabel = json.traversalCapped
        ? cliTFor(locale, "importJsonl.traversalHalted", { count: discovered })
        : String(discovered);
      const baseMsg = cliTFor(locale, "importJsonl.scanCapBase", {
        cap,
        skipped,
        discovered: discoveredLabel,
      });
      // If we already saw more than the server's hard cap (or the
      // walker stopped early), bumping --max-files won't help on its
      // own — recommend batching by subdirectory.
      if (discovered > upper || json.traversalCapped) {
        p.log.warn(
          cliTFor(locale, "importJsonl.scanCapBatch", {
            baseMsg,
            upper,
          }),
        );
      } else {
        const suggested = Math.min(
          Math.max((discovered || cap) + 100, cap * 2),
          upper,
        );
        p.log.warn(
          cliTFor(locale, "importJsonl.scanCapRerun", {
            baseMsg,
            suggested,
            upper,
          }),
        );
      }
    }
    if (json.sessionIds && json.sessionIds.length > 0) {
      p.log.info(cliTFor(locale, "importJsonl.viewReplay", { url: getViewerUrl() }));
    }
  } catch (err) {
    spinner.stop(cliTFor(locale, "importJsonl.failed"));
    if (err instanceof Error && err.name === "TimeoutError") {
      p.log.error(cliTFor(locale, "importJsonl.timedOut"));
    } else {
      p.log.error(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// `agentmemory remove` — clean uninstall.
//
// Planning logic lives in src/cli/remove-plan.ts so it's testable without
// touching $HOME. This function loads the manifest, builds the plan,
// double-confirms, then executes step by step.

function loadConnectManifest(home: string): ConnectManifest | null {
  const path = join(home, ".agentmemory", "backups", "connect-manifest.json");
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ConnectManifest>;
    if (Array.isArray(parsed?.installed)) {
      return { installed: parsed.installed };
    }
    return null;
  } catch {
    return null;
  }
}

function probeLocalBinIiiVersion(home: string): string | null {
  const path = localBinIii(home);
  if (!existsSync(path)) return null;
  return iiiBinVersion(path);
}

function humanBytesForCli(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function removePlanDescription(
  item: RemovePlanItem,
  locale: Locale,
  localBinIiiVersion: string | null,
): string {
  switch (item.id) {
    case "stop-engine":
      return cliTFor(locale, "remove.planStopEngine");
    case "pidfile":
      return cliTFor(locale, "remove.planPidfile");
    case "engine-state":
      return cliTFor(locale, "remove.planEngineState");
    case "env":
      return cliTFor(locale, "remove.planEnv");
    case "preferences":
      return cliTFor(locale, "remove.planPreferences");
    case "backups":
      return cliTFor(locale, "remove.planBackups");
    case "local-bin-iii":
      return item.alwaysAsk
        ? cliTFor(locale, "remove.planLocalBinIiiMismatch", {
          version: localBinIiiVersion ?? "unknown",
          pinnedVersion: IIPINNED_VERSION,
        })
        : cliTFor(locale, "remove.planLocalBinIiiMatched", {
          pinnedVersion: IIPINNED_VERSION,
        });
    case "data-dir":
      return cliTFor(locale, "remove.planDataDir");
    default:
      if (item.id.startsWith("connect:")) {
        const agent = item.description.match(/\(([^)]+)\)/)?.[1] ?? "unknown";
        return cliTFor(locale, "remove.planConnect", { agent });
      }
      return cliTFor(locale, "remove.planFallback", { description: item.description });
  }
}

function formatLocalizedRemovePlan(
  plan: RemovePlanItem[],
  locale: Locale,
  localBinIiiVersion: string | null,
): string {
  return plan
    .filter((item) => item.applicable)
    .map((item, index) => {
      const tag = item.alwaysAsk ? cliTFor(locale, "remove.planAsksTag") : "";
      const size = item.sizeBytes > 0 ? ` (${humanBytesForCli(item.sizeBytes)})` : "";
      const path = item.path ? `\n     ${item.path}` : "";
      return `  ${index + 1}. ${removePlanDescription(item, locale, localBinIiiVersion)}${tag}${size}${path}`;
    })
    .join("\n");
}

function safeDelete(path: string, locale: Locale = currentCliLocale()): { ok: boolean; message: string } {
  try {
    if (!existsSync(path)) {
      return { ok: true, message: cliTFor(locale, "remove.notPresent", { path }) };
    }
    const st = statSync(path);
    if (st.isDirectory()) {
      rmSync(path, { recursive: true, force: true });
    } else {
      unlinkSync(path);
    }
    return { ok: true, message: cliTFor(locale, "remove.deleted", { path }) };
  } catch (err) {
    return {
      ok: false,
      message: cliTFor(locale, "remove.failedDelete", {
        path,
        message: err instanceof Error ? err.message : String(err),
      }),
    };
  }
}

async function runRemove(): Promise<void> {
  const locale = currentCliLocale();
  p.intro(cliTFor(locale, "remove.intro"));
  const force = args.includes("--force");
  const keepData = args.includes("--keep-data");

  const home = homedir();
  const connectManifest = loadConnectManifest(home);
  const localBinIiiVersion = probeLocalBinIiiVersion(home);

  const options: RemoveOptions = { force, keepData };
  const plan = buildRemovePlan(
    {
      home,
      pinnedVersion: IIPINNED_VERSION,
      localBinIiiVersion,
      connectManifest,
    },
    options,
  );

  const applicable = plan.filter((it) => it.applicable);
  if (applicable.length === 0) {
    p.outro(cliTFor(locale, "remove.alreadyGone"));
    return;
  }

  p.note(
    formatLocalizedRemovePlan(plan, locale, localBinIiiVersion),
    cliTFor(locale, "remove.planTitle"),
  );

  if (!force) {
    const proceed = await p.confirm({
      message: cliTFor(locale, "remove.proceed"),
      initialValue: false,
    });
    if (p.isCancel(proceed) || proceed !== true) {
      p.cancel(cliTFor(locale, "remove.cancelled"));
      return;
    }
    const sure = await p.confirm({
      message: cliTFor(locale, "remove.irreversible"),
      initialValue: false,
    });
    if (p.isCancel(sure) || sure !== true) {
      p.cancel(cliTFor(locale, "remove.cancelled"));
      return;
    }
  }

  for (const item of plan) {
    if (!item.applicable) continue;

    // alwaysAsk items get a per-item confirmation even with --force.
    if (item.alwaysAsk) {
      const ok = await p.confirm({
        message: cliTFor(locale, "remove.reallyDelete", {
          description: item.description,
          path: item.path ? ` ${item.path}` : "",
        }),
        initialValue: false,
      });
      if (p.isCancel(ok) || ok !== true) {
        p.log.info(cliTFor(locale, "remove.skipped", { id: item.id }));
        continue;
      }
    }

    if (item.id === "stop-engine") {
      try {
        const port = getRestPort();
        const portPids = findEnginePidsByPort(port);
        const pidfilePid = readEnginePidfile();
        const cands = new Set<number>();
        if (pidfilePid) cands.add(pidfilePid);
        for (const pid of portPids) cands.add(pid);
        for (const pid of cands) await signalAndWait(pid, "SIGTERM", 3000);
        clearEnginePidfile();
        clearEngineState();
        p.log.success(
          cands.size > 0
            ? cliTFor(locale, "remove.stoppedEngine", {
              count: cands.size,
              pidLabel: cands.size === 1 ? "pid" : "pids",
            })
            : cliTFor(locale, "remove.noEngineRunning"),
        );
      } catch (err) {
        p.log.warn(
          cliTFor(locale, "remove.stopBestEffort", {
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      }
      continue;
    }

    if (!item.path) continue;
    const r = safeDelete(item.path, locale);
    if (r.ok) p.log.success(r.message);
    else p.log.error(r.message);
  }

  p.outro(cliTFor(locale, "remove.done"));
}

const commands: Record<string, () => Promise<void>> = {
  init: runInit,
  connect: runConnectCmd,
  status: runStatus,
  doctor: runDoctor,
  demo: runDemo,
  upgrade: runUpgrade,
  stop: runStop,
  remove: runRemove,
  mcp: runMcp,
  "import-jsonl": runImportJsonl,
};

const handler = commands[args[0] ?? ""] ?? main;
handler().catch((err) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
