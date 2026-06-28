import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { currentCliLocale, cliTFor } from "../i18n.js";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";

const OPENHUMAN_DIR = join(homedir(), ".openhuman");
const DOCS = "https://github.com/tinyhumansai/openhuman";

export const adapter: ConnectAdapter = {
  name: "openhuman",
  displayName: "OpenHuman",
  category: "native",
  docs: DOCS,
  protocolNote:
    "→ Using native hooks (REST API at :3111). MCP not required.",

  detect(): boolean {
    return existsSync(OPENHUMAN_DIR);
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const locale = opts.locale ?? currentCliLocale();
    p.log.warn(cliTFor(locale, "connect.openhuman.warn"));
    p.note(
      cliTFor(locale, "connect.openhuman.note", { docs: DOCS }),
      cliTFor(locale, "connect.openhuman.title"),
    );
    return {
      kind: "stub",
      reason: "no-integration-folder-yet",
    };
  },
};
