import { execSync } from "node:child_process";
import { basename } from "node:path";

export function resolveProject(cwd: unknown): string {
  const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
  if (explicit && explicit.trim()) return explicit.trim();

  const dir = typeof cwd === "string" && cwd.trim() ? cwd : process.cwd();
  try {
    const top = execSync("git rev-parse --show-toplevel", {
      cwd: dir,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    }).toString().trim();
    if (top) return basename(top);
  } catch {}

  return basename(dir);
}
