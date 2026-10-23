export const DEFAULT_LEVEL_TITLE = "Untitled";
export const LEVEL_TITLE_MAX_LENGTH = 51;

export function normalizeLevelTitle(title: string): string {
  return title.replace(/[^\x20-\x7E]/g, "").slice(0, LEVEL_TITLE_MAX_LENGTH);
}
