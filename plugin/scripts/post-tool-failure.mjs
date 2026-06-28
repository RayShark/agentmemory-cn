#!/usr/bin/env node
import { execSync } from "node:child_process";
import { basename } from "node:path";

//#region src/hooks/env.ts
function loadHookEnv() {
	if (process.env["AGENTMEMORY_LOAD_ENV"] === "false") return;
	const home = process.env["HOME"];
	if (!home) return;
	try {
		process.loadEnvFile(`${home}/.agentmemory/.env`);
	} catch {}
}

//#endregion
//#region src/hooks/project.ts
function resolveProject(cwd) {
	const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
	if (explicit && explicit.trim()) return explicit.trim();
	const dir = typeof cwd === "string" && cwd.trim() ? cwd : process.cwd();
	try {
		const top = execSync("git rev-parse --show-toplevel", {
			cwd: dir,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout: 500
		}).toString().trim();
		if (top) return gitCommonDirBasename(dir) ?? basename(top);
	} catch {}
	return basename(dir);
}
function gitCommonDirBasename(cwd) {
	try {
		const commonDir = execSync("git rev-parse --git-common-dir", {
			cwd,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout: 500
		}).toString().trim();
		if (!commonDir) return null;
		return basename(commonDir.replace(/\/\.git$/, ""));
	} catch {
		return null;
	}
}

//#endregion
//#region src/hooks/post-tool-failure.ts
loadHookEnv();
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";
function authHeaders() {
	const h = { "Content-Type": "application/json" };
	if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
	return h;
}
async function main() {
	let input = "";
	for await (const chunk of process.stdin) input += chunk;
	let data;
	try {
		data = JSON.parse(input);
	} catch {
		return;
	}
	if (isSdkChildContext(data)) return;
	if (data.is_interrupt || data.isInterrupt) return;
	const rawSessionId = data.session_id ?? data.sessionId;
	const sessionId = typeof rawSessionId === "string" && rawSessionId.length > 0 ? rawSessionId : "unknown";
	const toolName = data.tool_name ?? data.toolName;
	const toolInput = data.tool_input ?? data.toolArgs;
	const error = data.error ?? data.errorMessage;
	const cwd = typeof data.cwd === "string" && data.cwd.length > 0 ? data.cwd : process.cwd();
	fetch(`${REST_URL}/agentmemory/observe`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			hookType: "post_tool_failure",
			sessionId,
			project: resolveProject(cwd),
			cwd,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			data: {
				tool_name: toolName,
				tool_input: typeof toolInput === "string" ? toolInput.slice(0, 4e3) : JSON.stringify(toolInput ?? "").slice(0, 4e3),
				error: typeof error === "string" ? error.slice(0, 4e3) : JSON.stringify(error ?? "").slice(0, 4e3)
			}
		}),
		signal: AbortSignal.timeout(3e3)
	}).catch(() => {});
	setTimeout(() => process.exit(0), 500).unref();
}
main();

//#endregion
export {  };
//# sourceMappingURL=post-tool-failure.mjs.map