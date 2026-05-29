import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = new URL("..", import.meta.url).pathname;

async function runHook(
  script: string,
  payload: Record<string, unknown>,
  url: string,
): Promise<{ code: number | null; stderr: string }> {
  const child = spawn(process.execPath, ["--import", "tsx", script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AGENTMEMORY_LOAD_ENV: "false",
      AGENTMEMORY_URL: url,
      AGENTMEMORY_SECRET: "",
    },
    stdio: ["pipe", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr.setEncoding("utf-8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.end(JSON.stringify(payload));

  const [code] = (await once(child, "exit")) as [number | null];
  return { code, stderr };
}

describe("hook payload compatibility", () => {
  it("accepts Codex camelCase fields in post-tool-use payloads", async () => {
    let observed: Record<string, unknown> | undefined;
    const server = createServer((req, res) => {
      let body = "";
      req.setEncoding("utf-8");
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        observed = JSON.parse(body) as Record<string, unknown>;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      });
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing server port");

    try {
      const result = await runHook(
        join(repoRoot, "src", "hooks", "post-tool-use.ts"),
        {
          sessionId: "codex-camel-session",
          cwd: repoRoot,
          toolName: "Read",
          toolArgs: { file_path: "src/hooks/post-tool-use.ts" },
          toolResult: { textResultForLlm: "ok" },
        },
        `http://127.0.0.1:${address.port}`,
      );

      expect(result).toMatchObject({ code: 0, stderr: "" });
      expect(observed).toMatchObject({
        hookType: "post_tool_use",
        sessionId: "codex-camel-session",
        project: "agentmemory",
        data: {
          tool_name: "Read",
          tool_input: { file_path: "src/hooks/post-tool-use.ts" },
          tool_output: "ok",
        },
      });
    } finally {
      server.close();
    }
  });
});
