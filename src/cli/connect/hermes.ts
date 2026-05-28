import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { currentCliLocale, cliTFor } from "../i18n.js";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";

const HERMES_DIR = join(homedir(), ".hermes");
const HERMES_CONFIG = join(HERMES_DIR, "config.yaml");
const DOCS = "https://github.com/rohitg00/agentmemory/tree/main/integrations/hermes";

export const adapter: ConnectAdapter = {
  name: "hermes",
  displayName: "Hermes Agent",
  docs: DOCS,
  protocolNote:
    "→ Using MCP. Hooks are also available — see docs/hermes.md.",

  detect(): boolean {
    return existsSync(HERMES_DIR);
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const locale = opts.locale ?? currentCliLocale();
    p.log.warn(cliTFor(locale, "connect.hermes.warn"));
    p.note(
      cliTFor(locale, "connect.hermes.note", {
        config: HERMES_CONFIG,
        docs: DOCS,
      }),
      cliTFor(locale, "connect.hermes.title"),
    );
    return {
      kind: "stub",
      reason: "yaml-merge-not-implemented",
    };
  },
};
