export const OPEN_KEYBOARD_SHORTCUTS_SHORTCUT = "?";

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
