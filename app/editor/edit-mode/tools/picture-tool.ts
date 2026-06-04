import type { EditorStore } from "~/editor/editor-store";
import type { EventContext } from "~/editor/helpers/event-handler";
import { defaultTools } from "./default-tools";
import { Tool } from "./tool-interface";
import { type Picture } from "~/editor/elma-types";
import { standardSprites } from "~/components/standard-sprites";

export type PictureToolState = Pick<Picture, "name" | "distance" | "clip">;

export const defaultPictureState: PictureToolState =
  standardSprites.pictures[0];

export class PictureTool extends Tool<PictureToolState> {
  readonly meta = defaultTools.picture;

  constructor(store: EditorStore) {
    super(store);
  }

  onActivate() {
    const { toolState, setToolState } = this.getState();
    if (!toolState) {
      setToolState(defaultPictureState);
    }
  }

  onPointerDown(_event: PointerEvent, context: EventContext): boolean {
    const { state, toolState } = this.getState();
    if (!toolState?.name) return false;

    const position = context.worldPos;
    const defaults =
      standardSprites.pictures.find((pic) => pic.name === toolState.name) ||
      defaultPictureState;
    state.actions.addPicture({
      ...defaults,
      ...toolState,
      name: toolState.name,
      texture: "",
      mask: "",
      position,
    });
    return true;
  }

  getDrafts() {
    const { state, toolState } = this.getState();
    if (!toolState?.name || !state.mouseOnCanvas) return {};

    const defaults =
      standardSprites.pictures.find((pic) => pic.name === toolState.name) ||
      defaultPictureState;
    const picture: Picture = {
      ...defaults,
      ...toolState,
      name: toolState.name,
      texture: "",
      mask: "",
      position: state.mousePosition,
    };

    return {
      pictures: [picture],
    };
  }
}
