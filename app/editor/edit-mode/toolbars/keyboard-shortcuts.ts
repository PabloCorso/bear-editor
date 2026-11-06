export const GO_TO_PLAY_START_SHORTCUT = "Shift + Enter";
export const OPEN_AI_PROMPT_LIBRARY_SHORTCUT = "Shift + A";
export const OPEN_KEYBOARD_SHORTCUTS_SHORTCUT = "?";

export function isAiPromptLibraryShortcut(event: KeyboardEvent) {
  return (
    event.key.toLowerCase() === "a" &&
    event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.isComposing
  );
}

export function getNewLevelShortcut(isMac: boolean) {
  return isMac ? "Ctrl + N" : "Ctrl + Alt + N";
}

export function isNewLevelShortcut(event: KeyboardEvent, isMac: boolean) {
  return (
    event.key.toLowerCase() === "n" &&
    event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.altKey === !isMac
  );
}

export function formatShortcutCode(code: string): string {
  if (code === "") return "Unassigned";
  if (code === "ArrowLeft") return "←";
  if (code === "ArrowUp") return "↑";
  if (code === "ArrowRight") return "→";
  if (code === "ArrowDown") return "↓";
  if (code === "Equal") return "=";
  if (code === "Minus") return "-";
  if (code.startsWith("Key")) return code.slice(3);
  return code;
}
