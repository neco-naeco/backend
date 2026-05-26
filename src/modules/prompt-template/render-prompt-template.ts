const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/** Replaces `{{name}}` placeholders; unknown keys become empty strings. */
export function renderPromptTemplate(
  templateText: string,
  variables: Record<string, string | number | undefined | null>,
): string {
  return templateText.replace(VARIABLE_PATTERN, (_, key: string) => {
    const value = variables[key];
    if (value === undefined || value === null) {
      return '';
    }
    return String(value);
  });
}

/** Strips lines that are empty after variable substitution to keep prompts compact. */
export function compactRenderedPrompt(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => {
      if (line.length > 0) {
        return true;
      }
      const nextNonEmpty = lines.slice(index + 1).some((l) => l.trim().length > 0);
      const prevNonEmpty = lines.slice(0, index).some((l) => l.trim().length > 0);
      return prevNonEmpty && nextNonEmpty;
    })
    .join('\n')
    .trim();
}
