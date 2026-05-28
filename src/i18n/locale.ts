export const SUPPORTED_LOCALES = ["en", "zh-CN"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function resolveLocale(raw?: string): Locale {
  const normalized = raw?.trim().replace("_", "-").toLowerCase();
  if (!normalized) return "en";
  if (normalized === "zh" || normalized === "zh-cn") return "zh-CN";
  if (normalized === "en" || normalized === "en-us" || normalized === "en-gb") {
    return "en";
  }
  return "en";
}
