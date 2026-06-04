import { standardSprites } from "~/components/standard-sprites";
import type { EditorStore } from "~/editor/editor-store";
import type { Picture } from "~/editor/elma-types";
import type { EventContext } from "~/editor/helpers/event-handler";
import { defaultTools } from "./default-tools";
import { Tool } from "./tool-interface";

export type TextureToolState = Pick<
  Picture,
  "texture" | "mask" | "distance" | "clip"
>;

export const defaultTextureState: TextureToolState = {
  ...standardSprites.textures[0],
  mask: standardSprites.textureMasks[0],
};

export class TextureTool extends Tool<TextureToolState> {
  readonly meta = defaultTools.texture;

  constructor(store: EditorStore) {
    super(store);
  }

  onActivate() {
    const { toolState, setToolState } = this.getState();
    if (!toolState) {
      setToolState(defaultTextureState);
    }
  }

  onPointerDown(_event: PointerEvent, context: EventContext): boolean {
    const { state, toolState } = this.getState();
    if (!toolState?.texture) return false;

    const position = context.worldPos;
    const defaults =
      standardSprites.textures.find(
        (texture) => texture.texture === toolState.texture,
      ) || defaultTextureState;
    const mask =
      toolState.mask || defaults.mask || standardSprites.textureMasks[0];

    state.actions.addPicture({
      ...defaults,
      ...toolState,
      name: "",
      texture: toolState.texture,
      mask,
      position,
    });

    return true;
  }

  getDrafts() {
    const { state, toolState } = this.getState();
    if (!toolState?.texture || !state.mouseOnCanvas) return {};

    const maskName = toolState.mask || standardSprites.textureMasks[0];
    const defaults =
      standardSprites.textures.find(
        (texture) => texture.texture === toolState.texture,
      ) || defaultTextureState;
    const picture: Picture = {
      ...defaults,
      ...toolState,
      name: "",
      texture: toolState.texture,
      mask: maskName,
      position: state.mousePosition,
    };

    return {
      pictures: [picture],
    };
  }
}
