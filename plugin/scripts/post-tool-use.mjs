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
//#region src/hooks/post-tool-use.ts
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
	const toolName = data.tool_name ?? data.toolName;
	const toolInput = data.tool_input ?? data.toolArgs;
	const { imageData, cleanOutput } = extractImageData(toolOutput(data));
	const cwd = typeof data.cwd === "string" && data.cwd.length > 0 ? data.cwd : process.cwd();
	fetch(`${REST_URL}/agentmemory/observe`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			hookType: "post_tool_use",
			sessionId,
			project: resolveProject(cwd),
			cwd,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			data: {
				tool_name: toolName,
				tool_input: toolInput,
				tool_output: truncate(cleanOutput, 8e3),
				...imageData ? { image_data: imageData } : {}
			}
		}),
		signal: AbortSignal.timeout(3e3)
	}).catch(() => {});
	setTimeout(() => process.exit(0), 500).unref();
}
function toolOutput(data) {
	if (data.tool_response !== void 0) return data.tool_response;
	if (data.tool_output !== void 0) return data.tool_output;
	const result = data.tool_result ?? data.toolResult;
	if (typeof result === "object" && result !== null) {
		const obj = result;
		return obj.text_result_for_llm ?? obj.textResultForLlm ?? result;
	}
	return result;
}
function isBase64Image(val) {
	return typeof val === "string" && (val.startsWith("data:image/") || val.startsWith("iVBORw0KGgo") || val.startsWith("/9j/"));
}
function extractImageData(output) {
	if (isBase64Image(output)) return {
		imageData: output,
		cleanOutput: "[image data extracted]"
	};
	if (typeof output === "object" && output !== null && !Array.isArray(output)) {
		const obj = output;
		let imageData;
		const clean = {};
		for (const [key, val] of Object.entries(obj)) if (!imageData && isBase64Image(val)) {
			imageData = val;
			clean[key] = "[image data extracted]";
		} else clean[key] = val;
		return {
			imageData,
			cleanOutput: clean
		};
	}
	return {
		imageData: void 0,
		cleanOutput: output
	};
}
function truncate(value, max) {
	if (typeof value === "string" && value.length > max) return value.slice(0, max) + "\n[...truncated]";
	if (typeof value === "object" && value !== null) {
		let str;
		try {
			str = JSON.stringify(value);
		} catch {
			return "[unserializable tool output]";
		}
		if (str.length > max) return str.slice(0, max) + "...[truncated]";
		return value;
	}
	return value;
}
main().catch(() => {});

//#endregion
export {  };
//# sourceMappingURL=post-tool-use.mjs.map