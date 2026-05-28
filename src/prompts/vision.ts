import { languageInstruction, type Locale } from "../i18n/index.js";

const VISION_DESCRIPTION_PROMPT_BASE = `Describe what this image shows in the context of software development. Extract:
- What type of image this is (screenshot, diagram, mockup, terminal output, error, etc.)
- Key entities visible (files, components, UI elements, error messages)
- Relationships or flow shown
- Any decisions, errors, or state visible
- Text content visible in the image

Be concise but preserve all technically relevant details. Output plain text, no XML.`;

export function buildVisionDescriptionPrompt(locale: Locale = "en"): string {
  const instruction = languageInstruction(locale);
  return instruction
    ? `${VISION_DESCRIPTION_PROMPT_BASE}\n\nLanguage:\n- ${instruction}\n- Preserve visible text, commands, file paths, and error messages exactly as shown in the image.`
    : VISION_DESCRIPTION_PROMPT_BASE;
}

export const VISION_DESCRIPTION_PROMPT = buildVisionDescriptionPrompt();
