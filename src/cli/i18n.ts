import { getLocale } from "../config.js";
import { t, type Locale } from "../i18n/index.js";

export type CliParams = Record<string, string | number | boolean>;

export function currentCliLocale(): Locale {
  return getLocale();
}

export function cliT(key: string, params: CliParams = {}): string {
  return t(currentCliLocale(), `cli.${key}`, params);
}

export function cliTFor(
  locale: Locale,
  key: string,
  params: CliParams = {},
): string {
  return t(locale, `cli.${key}`, params);
}
