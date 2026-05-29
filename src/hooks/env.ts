export function loadHookEnv(): void {
  if (process.env["AGENTMEMORY_LOAD_ENV"] === "false") return;

  const home = process.env["HOME"];
  if (!home) return;

  try {
    process.loadEnvFile(`${home}/.agentmemory/.env`);
  } catch {
    // Hooks are best-effort; missing or unreadable env files must not fail the host.
  }
}
