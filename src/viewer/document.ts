import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VIEWER_NONCE_PLACEHOLDER,
  createViewerNonce,
  buildViewerCsp,
} from "../auth.js";
import { VERSION } from "../version.js";
import {
  buildViewerLocaleBundle,
  serializeViewerLocaleBundle,
} from "./locales.js";

const VIEWER_VERSION_PLACEHOLDER = "__AGENTMEMORY_VERSION__";
const VIEWER_LOCALE_PLACEHOLDER = "__AGENTMEMORY_VIEWER_LOCALE__";

function loadViewerTemplate(): string | null {
  const base = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(base, "..", "src", "viewer", "index.html"),
    join(base, "..", "viewer", "index.html"),
    join(base, "viewer", "index.html"),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, "utf-8");
    } catch {}
  }
  return null;
}

export function renderViewerDocument():
  | { found: true; html: string; csp: string }
  | { found: false } {
  const template = loadViewerTemplate();
  if (!template) {
    return { found: false };
  }

  const nonce = createViewerNonce();
  const localeBundle = serializeViewerLocaleBundle(buildViewerLocaleBundle());
  const html = template
    .replaceAll(VIEWER_NONCE_PLACEHOLDER, nonce)
    .replaceAll(VIEWER_VERSION_PLACEHOLDER, VERSION)
    .replaceAll(VIEWER_LOCALE_PLACEHOLDER, localeBundle);
  return {
    found: true,
    html,
    csp: buildViewerCsp(nonce),
  };
}
