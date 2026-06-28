#!/usr/bin/env node
import { loadHookEnv } from "./env.js";
import { resolveProject } from "./project.js";

loadHookEnv();

function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
  return h;
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(input);
  } catch {
    return;
  }

  if (isSdkChildContext(data)) return;

  const rawSessionId = data.session_id ?? data.sessionId;
  const sessionId =
    typeof rawSessionId === "string" && rawSessionId.length > 0
      ? rawSessionId
      : "unknown";
  const cwd =
    typeof data.cwd === "string" && data.cwd.length > 0
      ? data.cwd
      : process.cwd();
  fetch(`${REST_URL}/agentmemory/observe`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      hookType: "prompt_submit",
      sessionId,
      project: resolveProject(cwd),
      cwd,
      timestamp: new Date().toISOString(),
      data: { prompt: data.prompt ?? data.userPrompt },
    }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
  setTimeout(() => process.exit(0), 500).unref();
}

main();
