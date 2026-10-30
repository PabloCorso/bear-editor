import { Tool } from "./tool-interface";
import type { EventContext } from "~/editor/helpers/event-handler";
import type { EditorStore } from "~/editor/editor-store";
import { defaultTools } from "./default-tools";

export class FlowerTool extends Tool {
  readonly meta = defaultTools.flower;

  constructor(store: EditorStore) {
    super(store);
  }

  onPointerDown(_event: PointerEvent, context: EventContext): boolean {
    const { state } = this.getState();
    state.actions.addFlower(this.snapPosition(context.worldPos, _event.altKey));
    return true;
  }

  getDrafts() {
    const { state } = this.getState();
    if (!state.mouseOnCanvas) return {};
    return { flowers: [this.snapPosition(state.mousePosition)] };
  }
}
