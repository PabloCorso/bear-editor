/**
 * Keyboard input manager with edge detection.
 * Tracks current and previous key states for "just pressed" detection.
 */

export class InputManager {
  private keyboardKeys = new Set<string>();
  private virtualKeys = new Set<string>();
  private previousKeys = new Set<string>();
  private justPressedKeys = new Set<string>();
  private extraGameKeys: Set<string>;
  private handleKeyDown: (e: KeyboardEvent) => void;
  private handleKeyUp: (e: KeyboardEvent) => void;
  private handleBlur: () => void;

  constructor(
    extraGameKeys: string[] = [],
    initialKeys: string[] = [],
    listenToKeyboard = true,
  ) {
    this.extraGameKeys = new Set(extraGameKeys);
    this.keyboardKeys = new Set(initialKeys);
    this.justPressedKeys = new Set(initialKeys);
    this.handleKeyDown = (e: KeyboardEvent) => {
      if (!this.isDown(e.code)) {
        this.justPressedKeys.add(e.code);
      }
      this.keyboardKeys.add(e.code);
      if (this.isGameKey(e.code)) e.preventDefault();
    };
    this.handleKeyUp = (e: KeyboardEvent) => {
      this.keyboardKeys.delete(e.code);
    };
    this.handleBlur = () => {
      this.keyboardKeys.clear();
      this.virtualKeys.clear();
    };

    if (listenToKeyboard && typeof window !== "undefined") {
      window.addEventListener("keydown", this.handleKeyDown);
      window.addEventListener("keyup", this.handleKeyUp);
      window.addEventListener("blur", this.handleBlur);
    }
  }

  /** Remove all event listeners. Call when the game is stopped. */
  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.handleKeyDown);
      window.removeEventListener("keyup", this.handleKeyUp);
      window.removeEventListener("blur", this.handleBlur);
    }
    this.keyboardKeys.clear();
    this.virtualKeys.clear();
    this.previousKeys.clear();
    this.justPressedKeys.clear();
  }

  /** Call once per frame after processing inputs */
  update(): void {
    this.previousKeys = this.getActiveKeys();
    this.justPressedKeys.clear();
  }

  setExtraGameKeys(keys: string[]): void {
    this.extraGameKeys = new Set(keys);
  }

  pressKey(code: string): void {
    if (!this.isDown(code)) {
      this.justPressedKeys.add(code);
    }
    this.virtualKeys.add(code);
  }

  seedJustPressedKey(code: string): void {
    if (this.isDown(code)) {
      this.justPressedKeys.add(code);
    }
  }

  releaseKey(code: string): void {
    this.virtualKeys.delete(code);
  }

  releaseKeys(codes: string[]): void {
    for (const code of codes) {
      this.virtualKeys.delete(code);
    }
  }

  isDown(key: string): boolean {
    return this.keyboardKeys.has(key) || this.virtualKeys.has(key);
  }

  wasJustPressed(key: string): boolean {
    return this.justPressedKeys.has(key);
  }

  wasJustReleased(key: string): boolean {
    return !this.isDown(key) && this.previousKeys.has(key);
  }

  private getActiveKeys(): Set<string> {
    return new Set([...this.keyboardKeys, ...this.virtualKeys]);
  }

  private isGameKey(code: string): boolean {
    return (
      code.startsWith("Arrow") ||
      code === "Space" ||
      code === "Escape" ||
      code === "F1" ||
      code === "F2" ||
      code === "F3" ||
      this.extraGameKeys.has(code)
    );
  }
}

/** Default key bindings matching Elma defaults */
export interface KeyBindings {
  gas: string;
  brake: string;
  alovolt: string;
  rightVolt: string;
  leftVolt: string;
  turn: string;
  toggleMinimap: string;
  toggleTimer: string;
  escape: string;
  // Replay controls
  replayFast2x: string;
  replayFast4x: string;
  replayFast8x: string;
  replaySlow2x: string;
  replaySlow4x: string;
  replayPause: string;
  replayRewind: string;
  // Screen size
  zoomIn: string;
  zoomOut: string;
}

export const DEFAULT_KEYS: KeyBindings = {
  gas: "ArrowUp",
  brake: "ArrowDown",
  alovolt: "KeyD",
  rightVolt: "ArrowRight",
  leftVolt: "ArrowLeft",
  turn: "Space",
  toggleMinimap: "KeyV",
  toggleTimer: "KeyT",
  escape: "Escape",
  replayFast2x: "KeyW",
  replayFast4x: "KeyE",
  replayFast8x: "KeyR",
  replaySlow2x: "KeyQ",
  replaySlow4x: "KeyA",
  replayPause: "KeyP",
  replayRewind: "Backspace",
  zoomIn: "Equal",
  zoomOut: "Minus",
};
