import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getLocale } from "../config.js";
import { resolveLocale, type Locale } from "../i18n/index.js";

export type ViewerMessages = Record<string, unknown>;

export type ViewerLocaleBundle = {
  locale: Locale;
  messages: {
    en: ViewerMessages;
    current: ViewerMessages;
  };
};

const cache = new Map<Locale, ViewerMessages>();

function localeCandidates(locale: Locale): string[] {
  const base = dirname(fileURLToPath(import.meta.url));
  const file = `${locale}.json`;
  return [
    join(base, "locales", file),
    join(base, "..", "viewer", "locales", file),
    join(base, "..", "src", "viewer", "locales", file),
  ];
}

function loadMessages(locale: Locale): ViewerMessages {
  const cached = cache.get(locale);
  if (cached) return cached;
  for (const path of localeCandidates(locale)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as ViewerMessages;
      cache.set(locale, parsed);
      return parsed;
    } catch {}
  }
  const empty: ViewerMessages = {};
  cache.set(locale, empty);
  return empty;
}

export function buildViewerLocaleBundle(rawLocale: string = getLocale()): ViewerLocaleBundle {
  const locale = resolveLocale(rawLocale);
  const en = loadMessages("en");
  const current = locale === "en" ? en : loadMessages(locale);
  return {
    locale,
    messages: { en, current },
  };
}

export function serializeViewerLocaleBundle(bundle: ViewerLocaleBundle): string {
  return JSON.stringify(bundle).replace(/</g, "\\u003c");
}
