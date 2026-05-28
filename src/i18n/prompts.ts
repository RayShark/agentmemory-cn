import type { Locale } from "./locale.js";

const ZH_CN_LANGUAGE_INSTRUCTION =
  "所有面向人的自然语言字段必须使用简体中文。保留代码标识符、文件路径、命令、API 名称、enum 枚举值、XML/JSON 标签和值域原样。";

export function languageInstruction(locale: Locale): string {
  return locale === "zh-CN" ? ZH_CN_LANGUAGE_INSTRUCTION : "";
}
