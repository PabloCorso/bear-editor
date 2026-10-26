import { standardSprites } from "~/components/standard-sprites";
import type { EditorStore } from "~/editor/editor-store";
import type { Picture } from "~/editor/elma-types";
import type { EventContext } from "~/editor/helpers/event-handler";
import { defaultTools } from "./default-tools";
import { Tool, type PlacementPropertiesMenuState } from "./tool-interface";

export type TextureToolState = Pick<
  Picture,
  "texture" | "mask" | "distance" | "clip"
> &
  PlacementPropertiesMenuState;

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

  onRightClick(event: MouseEvent, context: EventContext): boolean {
    const { state, toolState, setToolState } = this.getState();
    if (!toolState?.texture) return false;
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
      distance: toolState.distance,
      clip: toolState.clip,
      name: "",
      texture: toolState.texture,
      mask,
      position,
    });

    return true;
  }

  getDrafts() {
    const { state, toolState } = this.getState();
    if (
      !toolState?.texture ||
      (!state.mouseOnCanvas && !toolState.propertiesMenu)
    )
      return {};

    const maskName = toolState.mask || standardSprites.textureMasks[0];
    const defaults =
      standardSprites.textures.find(
        (texture) => texture.texture === toolState.texture,
      ) || defaultTextureState;
    const picture: Picture = {
      ...defaults,
      distance: toolState.distance,
      clip: toolState.clip,
      name: "",
      texture: toolState.texture,
      mask: maskName,
      position: toolState.propertiesMenu?.worldPosition ?? state.mousePosition,
    };

    return {
      pictures: [picture],
    };
  }
}
