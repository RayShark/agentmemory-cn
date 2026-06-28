#!/usr/bin/env node
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
//#region src/hooks/stop.ts
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
	const rawSessionId = data.session_id ?? data.sessionId;
	const sessionId = typeof rawSessionId === "string" && rawSessionId.length > 0 ? rawSessionId : "unknown";
	fetch(`${REST_URL}/agentmemory/summarize`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({ sessionId }),
		signal: AbortSignal.timeout(12e4)
	}).catch(() => {});
	fetch(`${REST_URL}/agentmemory/session/end`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({ sessionId }),
		signal: AbortSignal.timeout(5e3)
	}).catch(() => {});
	setTimeout(() => process.exit(0), 1500).unref();
}
main();

//#endregion
export {  };
//# sourceMappingURL=stop.mjs.map