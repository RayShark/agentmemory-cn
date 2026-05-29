#!/usr/bin/env node
import { loadHookEnv } from "./env.mjs";
import { resolveProject } from "./project.mjs";

//#region src/hooks/notification.ts
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
	const notificationType = data.notification_type ?? data.notificationType;
	if (notificationType !== "permission_prompt") return;
	const sessionId = data.session_id || data.sessionId || "unknown";
	const cwd = data.cwd || process.cwd();
	fetch(`${REST_URL}/agentmemory/observe`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			hookType: "notification",
			sessionId,
			project: resolveProject(cwd),
			cwd,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			data: {
				notification_type: notificationType,
				title: data.title,
				message: data.message
			}
		}),
		signal: AbortSignal.timeout(2e3)
	}).catch(() => {});
	setTimeout(() => process.exit(0), 500).unref();
}
main();

//#endregion
export {  };
//# sourceMappingURL=notification.mjs.map