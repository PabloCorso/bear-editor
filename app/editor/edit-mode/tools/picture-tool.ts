import type { EditorStore } from "~/editor/editor-store";
import type { EventContext } from "~/editor/helpers/event-handler";
import { defaultTools, type ToolMeta } from "./default-tools";
import { Tool, type PlacementPropertiesMenuState } from "./tool-interface";
import { type Picture } from "~/editor/elma-types";
import { standardSprites } from "~/components/standard-sprites";

export type PictureToolState = Pick<Picture, "name" | "distance" | "clip"> &
  PlacementPropertiesMenuState;

export const defaultPictureState: PictureToolState =
  standardSprites.pictures[0];

export class PictureTool extends Tool<PictureToolState> {
  readonly meta: ToolMeta = defaultTools.picture;

  constructor(store: EditorStore) {
    super(store);
  }

  onActivate() {
    const { toolState, setToolState } = this.getState();
    if (!toolState) {
      setToolState(defaultPictureState);
    }
  }

  onRightClick(event: MouseEvent, context: EventContext): boolean {
    const { state, toolState, setToolState } = this.getState();
    if (!toolState?.name) return false;
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
    if (!toolState?.name) return false;

    const position = context.worldPos;
    const defaults =
      standardSprites.pictures.find((pic) => pic.name === toolState.name) ||
      defaultPictureState;
    state.actions.addPicture({
      ...defaults,
      distance: toolState.distance,
      clip: toolState.clip,
      name: toolState.name,
      texture: "",
      mask: "",
      position,
    });
    return true;
  }

  getDrafts() {
    const { state, toolState } = this.getState();
    if (!toolState?.name || (!state.mouseOnCanvas && !toolState.propertiesMenu))
      return {};

    const defaults =
      standardSprites.pictures.find((pic) => pic.name === toolState.name) ||
      defaultPictureState;
    const picture: Picture = {
      ...defaults,
      distance: toolState.distance,
      clip: toolState.clip,
      name: toolState.name,
      texture: "",
      mask: "",
      position: toolState.propertiesMenu?.worldPosition ?? state.mousePosition,
    };

    return {
      pictures: [picture],
    };
  }
}
