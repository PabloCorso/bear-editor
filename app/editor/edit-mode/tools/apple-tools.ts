import { Tool, type PlacementPropertiesMenuState } from "./tool-interface";
import type { EventContext } from "~/editor/helpers/event-handler";
import type { EditorStore } from "~/editor/editor-store";
import { defaultTools } from "./default-tools";
import { Gravity, type Apple, type AppleAnimation } from "~/editor/elma-types";

export type AppleToolState = {
  animation: AppleAnimation;
  gravity: Gravity;
} & PlacementPropertiesMenuState;

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

  onRightClick(event: MouseEvent, context: EventContext): boolean {
    const { state, toolState, setToolState } = this.getState();
    if (!toolState) return false;
    state.actions.setToolMenuOpen(false);
    setToolState({
      propertiesMenu: {
        clientPosition: { x: event.clientX, y: event.clientY },
        worldPosition: context.worldPos,
      },
    });
    return true;
  }

  onDeactivate() {
    this.getState().setToolState({ propertiesMenu: undefined });
  }

  onPointerDown(_event: PointerEvent, context: EventContext): boolean {
    const { state, toolState, setToolState } = this.getState();
    if (toolState?.propertiesMenu) {
      setToolState({ propertiesMenu: undefined });
      return true;
    }
    if (!toolState) return false;
    const position = this.snapPosition(context.worldPos, _event.altKey);
    state.actions.addApple({
      position,
      animation: toolState.animation,
      gravity: toolState.gravity,
    });
    return true;
  }

  onKeyDown(event: KeyboardEvent) {
    const { setToolState } = this.getState();
    const directionalGravity: Partial<Record<string, Gravity>> = {
      ArrowUp: Gravity.Up,
      ArrowDown: Gravity.Down,
      ArrowLeft: Gravity.Left,
      ArrowRight: Gravity.Right,
    };
    const gravity = directionalGravity[event.key];
    if (
      gravity !== undefined &&
      event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      setToolState({ gravity });
      event.preventDefault();
      return true;
    }

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
    if (!toolState || (!state.mouseOnCanvas && !toolState.propertiesMenu))
      return {};
    const position = this.snapPosition(
      toolState.propertiesMenu?.worldPosition ?? state.mousePosition,
    );
    const apple: Apple = {
      position,
      animation: toolState.animation,
      gravity: toolState.gravity,
    };
    return { apples: [apple] };
  }
}
