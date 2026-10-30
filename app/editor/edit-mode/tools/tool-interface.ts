import { snapGridTranslation, snapToGrid } from "~/editor/grid";
import type { EventContext } from "~/editor/helpers/event-handler";
import type { EditorStore } from "~/editor/editor-store";
import type { Apple, Picture, Polygon, Position } from "~/editor/elma-types";
import type { WorldRect } from "~/editor/render/world-geometry";
import type { WorldRenderOverlayItem } from "~/editor/render/world-scene";
import type { ToolMeta } from "./default-tools";

export type ToolState<T = unknown> = Record<string, T>;
export type ToolCursor = string;

export type PlacementPropertiesMenuState = {
  propertiesMenu?: {
    clientPosition: Position;
    worldPosition: Position;
  };
};

export abstract class Tool<T extends ToolState = ToolState> {
  abstract readonly meta: ToolMeta;

  constructor(protected store: EditorStore) {}

  protected getState() {
    const state = this.store.getState();
    const toolState = state.actions.getToolState<T>(this.meta.id);
    const setToolState = (toolStatePatch: Partial<T>) => {
      state.actions.setToolState<T>(this.meta.id, toolStatePatch);
    };
    return { state, toolState, setToolState };
  }

  // Tool policies and preview/commit conventions: docs/tool-snapping.md.
  protected snapPosition(position: Position, bypass?: boolean): Position {
    const state = this.store.getState();
    return (bypass ?? state.gridSnapBypassed)
      ? position
      : snapToGrid(position, state.grid);
  }

  // Keep one anchor for the whole operation so relative geometry is preserved.
  protected snapTranslation(
    anchor: Position,
    delta: Position,
    bypass?: boolean,
  ): Position {
    const state = this.store.getState();
    return (bypass ?? state.gridSnapBypassed)
      ? delta
      : snapGridTranslation(anchor, delta, state.grid);
  }

  // Lifecycle
  onActivate?(variant?: string): void;
  onDeactivate?(): void;
  clear?(): void;

  // Event handling - return true if event was consumed
  onPointerDown?(event: PointerEvent, context: EventContext): boolean;
  onPointerMove?(event: PointerEvent, context: EventContext): boolean;
  onPointerUp?(event: PointerEvent, context: EventContext): boolean;
  onKeyDown?(event: KeyboardEvent, context: EventContext): boolean;
  onRightClick?(event: MouseEvent, context: EventContext): boolean;
  getCursor?(context: EventContext): ToolCursor | undefined;
  isInteracting?(): boolean;

  getWorldOverlays?(options: {
    viewportRect: WorldRect;
    modifierPressed?: boolean;
  }): WorldRenderOverlayItem[];

  // Draft elements for previewing while using the tool
  getDrafts?(): {
    polygons?: Polygon[];
    // Complete terrain replacement for non-destructive boolean previews.
    replacementPolygons?: Polygon[];
    hiddenPolygons?: Polygon[];
    apples?: Apple[];
    killers?: Position[];
    flowers?: Position[];
    start?: Position;
    pictures?: Picture[];
  };
}
