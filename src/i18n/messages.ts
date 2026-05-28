import enMessages from "./locales/en.json" with { type: "json" };
import zhCnMessages from "./locales/zh-CN.json" with { type: "json" };
import type { Locale } from "./locale.js";

type MessageTree = Record<string, unknown>;
type Params = Record<string, string | number | boolean>;

const CATALOGS: Record<Locale, MessageTree> = {
  en: enMessages,
  "zh-CN": zhCnMessages,
};

function lookup(tree: MessageTree, key: string): string | undefined {
  let current: unknown = tree;
  for (const part of key.split(".")) {
    if (
      current &&
      typeof current === "object" &&
      part in (current as Record<string, unknown>)
    ) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === "string" ? current : undefined;
}

function interpolate(template: string, params: Params): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key)
      ? String(params[key])
      : match,
  );
}

export function t(locale: Locale, key: string, params: Params = {}): string {
  const template = lookup(CATALOGS[locale], key) ?? lookup(CATALOGS.en, key);
  if (!template) return key;
  return interpolate(template, params);
}
