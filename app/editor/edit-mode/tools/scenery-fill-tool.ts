import type { LgrAssets } from "~/components/lgr-assets";
import { ELMA_PIXEL_SCALE } from "~/editor/constants";
import type { Picture, Polygon, Position } from "~/editor/elma-types";
import type { EventContext } from "~/editor/helpers/event-handler";
import { isPointInPolygon } from "~/editor/helpers/polygon-helpers";
import { findPolygonEdgeNearPosition } from "~/editor/helpers/selection-helpers";
import { generateTextureFill, polygonArea } from "~/editor/helpers/texture-fill";
import { defaultTools } from "./default-tools";
import { defaultPictureState } from "./picture-tool";
import { Tool } from "./tool-interface";

export type SceneryFillToolState = Pick<Picture, "name" | "distance" | "clip">;
type FillPreview = { pictures: Picture[]; error?: string };

/** Repeat ordinary picture/color tiles across a polygon.
 * Elma has no arbitrary polygon-clipped picture primitive; boundary tiles may spill.
 */
export abstract class SceneryFillTool extends Tool<SceneryFillToolState> {
  private resolveAssets: () => LgrAssets | null = () => null;
  private cached?: {
    polygon: Polygon;
    assets: LgrAssets;
    name: string;
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
      setToolState({
        name: this.meta.id === defaultTools.pictureFill.id ? defaultPictureState.name : "",
        distance: defaultPictureState.distance,
        clip: defaultPictureState.clip,
      });
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
    if (!state.levelVisibility.showPolygons && !state.levelVisibility.showGroundBounds)
      return null;
    if (!toolState.name) return { pictures: [], error: "Choose a picture or color." };
    const point = position ?? state.mousePosition;
    const candidates = state.polygons.filter(
      (polygon) => !polygon.grass && polygon.vertices.length >= 3,
    );
    const polygon =
      candidates
        .filter((item) => isPointInPolygon(point, item.vertices))
        .sort((a, b) => polygonArea(a.vertices) - polygonArea(b.vertices))[0] ??
      findPolygonEdgeNearPosition(point, candidates);
    if (!polygon) return null;
    const assets = this.resolveAssets();
    if (!assets?.isReady())
      return { pictures: [], error: "LGR assets are loading." };
    const sprite = assets.getSpritePixels(toolState.name);
    if (!sprite) return { pictures: [], error: "This picture is missing from the LGR." };
    if (sprite.width <= 0 || sprite.height <= 0)
      return { pictures: [], error: "This picture has no visible size." };
    const { name, distance, clip } = toolState;
    if (
      this.cached?.polygon === polygon &&
      this.cached.assets === assets &&
      this.cached.name === name &&
      this.cached.distance === distance &&
      this.cached.clip === clip
    ) return this.cached.preview;

    const width = sprite.width * ELMA_PIXEL_SCALE;
    const height = sprite.height * ELMA_PIXEL_SCALE;
    // The tile footprint (not the opacity outline) defines repeated-picture coverage.
    const result = generateTextureFill(polygon, [{
      mask: name,
      width,
      height,
      core: { minX: 0, minY: 0, maxX: width, maxY: height },
    }]);
    const preview: FillPreview = {
      error: result.error,
      pictures: result.placements.map(({ position }) => ({
        name, texture: "", mask: "", distance, clip, position,
      })),
    };
    this.cached = { polygon, assets, name, distance, clip, preview };
    return preview;
  }

  onPointerDown(event: PointerEvent, context: EventContext): boolean {
    if (event.button !== 0) return false;
    const preview = this.getFillPreview(context.worldPos);
    if (!preview?.pictures.length || preview.error) return false;
    const { state } = this.getState();
    this.edit("picture.place", () =>
      state.actions.setPictures([...state.pictures, ...preview.pictures]),
    );
    return true;
  }

  getCursor(): string {
    return this.getFillPreview()?.pictures.length ? "crosshair" : "not-allowed";
  }

  getDrafts() {
    return {
      pictures: this.getFillPreview()?.pictures ?? [],
      showPictureBounds: false,
    };
  }
}

export class PictureFillTool extends SceneryFillTool {
  readonly meta = defaultTools.pictureFill;
}

export class ColorFillTool extends SceneryFillTool {
  readonly meta = defaultTools.colorFill;
}
