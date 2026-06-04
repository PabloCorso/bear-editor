import { Tool } from "./tool-interface";
import type { EventContext } from "~/editor/helpers/event-handler";
import type { EditorStore } from "~/editor/editor-store";
import { defaultTools } from "./default-tools";
import { Gravity, type Apple, type AppleAnimation } from "~/editor/elma-types";

export type AppleToolState = { animation: AppleAnimation; gravity: Gravity };

export const defaultAppleState: AppleToolState = {
  animation: 1 as AppleAnimation,
  gravity: Gravity.None,
} as const;

export class AppleTool extends Tool<AppleToolState> {
  readonly meta = defaultTools.apple;

  constructor(store: EditorStore) {
    super(store);
  }

  onActivate() {
    const { toolState, setToolState } = this.getState();
    if (!toolState) {
      setToolState(defaultAppleState);
    }
  }

  onPointerDown(_event: PointerEvent, context: EventContext): boolean {
    const { state, toolState } = this.getState();
    if (!toolState) return false;
    const position = context.worldPos;
    state.actions.addApple({ position, ...toolState });
    return true;
  }

  onKeyDown(event: KeyboardEvent) {
    const { setToolState } = this.getState();
    switch (event.key.toUpperCase()) {
      case "N":
        setToolState({ gravity: Gravity.None });
        return true;
      case "1":
        setToolState({ animation: 1 });
        return true;
      case "2":
        setToolState({ animation: 2 });
        return true;
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9":
        setToolState({ animation: Number(event.key) as AppleAnimation });
        return true;
      default:
        return false;
    }
  }

  getDrafts() {
    const { state, toolState } = this.getState();
    if (!state.mouseOnCanvas || !toolState) return {};
    const position = state.mousePosition;
    const apple: Apple = { position, ...toolState };
    return { apples: [apple] };
  }
}
