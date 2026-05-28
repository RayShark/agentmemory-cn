import { describe, it, expect, afterEach } from "vitest";
import type { RawObservation } from "../src/types.js";
import { projectTimeline } from "../src/replay/timeline.js";

const ORIGINAL_LOCALE = process.env["AGENTMEMORY_LOCALE"];

afterEach(() => {
  if (ORIGINAL_LOCALE === undefined) delete process.env["AGENTMEMORY_LOCALE"];
  else process.env["AGENTMEMORY_LOCALE"] = ORIGINAL_LOCALE;
});

function obs(overrides: Partial<RawObservation>): RawObservation {
  return {
    id: overrides.id ?? "obs_1",
    sessionId: overrides.sessionId ?? "ses_i18n",
    timestamp: overrides.timestamp ?? "2026-05-28T10:00:00.000Z",
    hookType: overrides.hookType ?? "session_start",
    raw: {},
    ...overrides,
  };
}

describe("projectTimeline i18n", () => {
  it("localizes fallback labels for zh-CN without changing event kinds", () => {
    process.env["AGENTMEMORY_LOCALE"] = "zh-CN";
    const timeline = projectTimeline([
      obs({ id: "start", hookType: "session_start" }),
      obs({ id: "prompt", hookType: "prompt_submit", timestamp: "2026-05-28T10:00:01.000Z" }),
      obs({ id: "call", hookType: "pre_tool_use", timestamp: "2026-05-28T10:00:02.000Z", toolName: "Read" }),
      obs({ id: "result", hookType: "post_tool_use", timestamp: "2026-05-28T10:00:03.000Z", toolName: "Read" }),
      obs({ id: "error", hookType: "post_tool_failure", timestamp: "2026-05-28T10:00:04.000Z", toolName: "Bash" }),
      obs({ id: "call_fallback", hookType: "pre_tool_use", timestamp: "2026-05-28T10:00:04.500Z" }),
      obs({ id: "response", hookType: "stop", timestamp: "2026-05-28T10:00:05.000Z", assistantResponse: "" }),
      obs({ id: "end", hookType: "session_end", timestamp: "2026-05-28T10:00:06.000Z" }),
    ]);

    expect(timeline.events.map((e) => e.kind)).toEqual([
      "session_start",
      "prompt",
      "tool_call",
      "tool_result",
      "tool_error",
      "tool_call",
      "hook",
      "session_end",
    ]);
    expect(timeline.events.map((e) => e.label)).toEqual([
      "会话开始",
      "用户提示",
      "Read ▸ 调用",
      "Read ▸ 结果",
      "Bash ▸ 错误",
      "工具 ▸ 调用",
      "stop",
      "会话结束",
    ]);
  });
});
