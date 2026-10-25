import type { LgrAssets } from "~/components/lgr-assets";
import { standardSprites } from "~/components/standard-sprites";
import type { Picture, Polygon, Position } from "~/editor/elma-types";
import type { EventContext } from "~/editor/helpers/event-handler";
import { isPointInPolygon } from "~/editor/helpers/polygon-helpers";
import { findPolygonEdgeNearPosition } from "~/editor/helpers/selection-helpers";
import {
  createFillMask,
  generateTextureFill,
  polygonArea,
  type FillMask,
} from "~/editor/helpers/texture-fill";
import { defaultTools } from "./default-tools";
import { defaultTextureState } from "./texture-tool";
import { Tool } from "./tool-interface";

export type TextureFillToolState = Pick<
  Picture,
  "texture" | "distance" | "clip"
>;
type FillPreview = { pictures: Picture[]; error?: string };

export class TextureFillTool extends Tool<TextureFillToolState> {
  readonly meta = defaultTools.textureFill;
  private resolveAssets: () => LgrAssets | null = () => null;
  private maskAssets: LgrAssets | null = null;
  private masks: FillMask[] = [];
  private cached?: {
    polygon: Polygon;
    assets: LgrAssets;
    texture: string;
    distance: number;
    clip: number;
    preview: FillPreview;
  };

  setAssetsResolver(resolver: () => LgrAssets | null) {
    this.resolveAssets = resolver;
  }
  onActivate() {
    const { toolState, setToolState } = this.getState();
    if (!toolState) {
      const { texture, distance, clip } = defaultTextureState;
      setToolState({ texture, distance, clip });
    }
  }
  clear() {
    this.cached = undefined;
  }
  onDeactivate() {
    this.clear();
  }

  getFillPreview(position?: Position): FillPreview | null {
    const { state, toolState } = this.getState();
    if ((!position && !state.mouseOnCanvas) || !toolState) return null;
    if (
      !state.levelVisibility.showPolygons &&
      !state.levelVisibility.showGroundBounds
    )
      return null;
    const point = position ?? state.mousePosition;
    const candidates = state.polygons.filter(
      (p) => !p.grass && p.vertices.length >= 3,
    );
    // The innermost polygon wins, so nested sky polygons are targetable too.
    const polygon =
      candidates
        .filter((p) => isPointInPolygon(point, p.vertices))
        .sort((a, b) => polygonArea(a.vertices) - polygonArea(b.vertices))[0] ??
      findPolygonEdgeNearPosition(point, candidates);
    if (!polygon) return null;
    const assets = this.resolveAssets();
    if (!assets?.isReady())
      return { pictures: [], error: "Texture assets are loading." };
    if (!assets.getSprite(toolState.texture))
      return { pictures: [], error: "This texture is missing from the LGR." };
    const { texture, distance, clip } = toolState;
    const cached = this.cached;
    if (
      cached?.polygon === polygon &&
      cached.assets === assets &&
      cached.texture === texture &&
      cached.distance === distance &&
      cached.clip === clip
    )
      return cached.preview;
    if (this.maskAssets !== assets) {
      this.masks = standardSprites.textureMasks.flatMap((mask) => {
        const sprite = assets.getSpritePixels(mask);
        const result = sprite && createFillMask(mask, sprite);
        return result ? [result] : [];
      });
      this.maskAssets = assets;
    }
    const result = generateTextureFill(polygon, this.masks);
    const preview = {
      error: result.error,
      pictures: result.placements.map((placement) => ({
        ...placement,
        name: "",
        texture,
        distance,
        clip,
      })),
    };
    this.cached = { polygon, assets, texture, distance, clip, preview };
    return preview;
  }

  onPointerDown(event: PointerEvent, context: EventContext) {
    if (event.button !== 0) return false;
    const preview = this.getFillPreview(context.worldPos);
    if (!preview?.pictures.length || preview.error) return false;
    const { state } = this.getState();
    state.actions.setPictures([...state.pictures, ...preview.pictures]);
    return true;
  }
  getCursor() {
    return this.getFillPreview()?.pictures.length ? "crosshair" : "not-allowed";
  }
  getDrafts() {
    return {
      pictures: this.getFillPreview()?.pictures ?? [],
      showPictureBounds: false,
    };
  }
}
