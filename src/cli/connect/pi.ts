import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { currentCliLocale, cliTFor } from "../i18n.js";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";

const PI_DIR = join(homedir(), ".pi");
const PI_EXT_DIR = join(PI_DIR, "agent", "extensions", "agentmemory");
const DOCS = "https://github.com/rohitg00/agentmemory/tree/main/integrations/pi";

export const adapter: ConnectAdapter = {
  name: "pi",
  displayName: "pi",
  category: "native",
  docs: DOCS,
  protocolNote:
    "→ Using native hooks (REST API at :3111). MCP not required.",

  detect(): boolean {
    return existsSync(PI_DIR);
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const locale = opts.locale ?? currentCliLocale();
    p.log.warn(cliTFor(locale, "connect.pi.warn"));
    p.note(
      cliTFor(locale, "connect.pi.note", {
        extDir: PI_EXT_DIR,
        docs: DOCS,
      }),
      cliTFor(locale, "connect.pi.title"),
    );
    return {
      kind: "stub",
      reason: "ts-extension-copy-not-implemented",
    };
  },
};
