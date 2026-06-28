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
//#region src/hooks/session-start.ts
loadHookEnv();
function isSdkChildContext(payload) {
	if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
	if (!payload || typeof payload !== "object") return false;
	return payload.entrypoint === "sdk-ts";
}
const INJECT_CONTEXT = process.env["AGENTMEMORY_INJECT_CONTEXT"] === "true";
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";
const INJECT_TIMEOUT_MS = 1500;
const REGISTER_TIMEOUT_MS = 800;
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
	const rawSessionId = data.session_id ?? data.sessionId;
	const sessionId = typeof rawSessionId === "string" && rawSessionId.length > 0 ? rawSessionId : `ses_${Date.now().toString(36)}`;
	const cwd = typeof data.cwd === "string" && data.cwd.length > 0 ? data.cwd : process.cwd();
	const project = resolveProject(cwd);
	const url = `${REST_URL}/agentmemory/session/start`;
	const init = {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			sessionId,
			project,
			cwd
		})
	};
	if (!INJECT_CONTEXT) {
		fetch(url, {
			...init,
			signal: AbortSignal.timeout(REGISTER_TIMEOUT_MS)
		}).catch(() => {});
		return;
	}
	try {
		const res = await fetch(url, {
			...init,
			signal: AbortSignal.timeout(INJECT_TIMEOUT_MS)
		});
		if (res.ok) {
			const result = await res.json();
			if (result.context) process.stdout.write(result.context);
		}
	} catch {}
}
main();

//#endregion
export {  };
//# sourceMappingURL=session-start.mjs.map