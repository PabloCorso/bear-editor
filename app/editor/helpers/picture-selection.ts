import type { LgrAssets } from "~/components/lgr-assets";
import type { Picture, Position } from "~/editor/elma-types";
import { getClosestPointOnLineSegment } from "./coordinate-helpers";
import {
  getPictureWorldDimensions,
  getPictureWorldOutlineSegments,
  isWorldPointInPictureVisiblePixel,
} from "~/editor/render/picture-metrics";

export type PictureSelectionSettings = {
  boundary: "outline" | "rectangle";
  click: "interior" | "border" | "anchor";
  area: "bounds" | "anchor";
};
export const defaultPictureSelectionSettings: PictureSelectionSettings = {
  boundary: "outline",
  click: "interior",
  area: "bounds",
};

export function normalizePictureSelectionSettings(
  value?: Partial<PictureSelectionSettings>,
): PictureSelectionSettings {
  return {
    boundary: value?.boundary === "rectangle" ? "rectangle" : "outline",
    click:
      value?.click === "border" || value?.click === "anchor"
        ? value.click
        : "interior",
    area: value?.area === "anchor" ? "anchor" : "bounds",
  };
}

export function getPictureSelectionSegments(
  picture: {
    name?: string;
    texture?: string;
    mask?: string;
    position: Position;
  },
  assets: LgrAssets | null,
  boundary: PictureSelectionSettings["boundary"] = "outline",
): Position[][] | null {
  if (boundary === "outline")
    return getPictureWorldOutlineSegments(picture, assets);
  const size = getPictureWorldDimensions(picture, assets);
  if (!size) return null;
  const { x, y } = picture.position;
  const corners = [
    { x, y },
    { x: x + size.width, y },
    { x: x + size.width, y: y + size.height },
    { x, y: y + size.height },
  ];
  return corners.map((from, index) => [from, corners[(index + 1) % 4]]);
}

export function isPictureSelectionHit(
  point: Position,
  picture: Picture,
  assets: LgrAssets | null,
  settings: PictureSelectionSettings,
  tolerance: number,
): boolean {
  if (
    Math.hypot(point.x - picture.position.x, point.y - picture.position.y) <=
    tolerance
  )
    return true;
  if (settings.click === "anchor") return false;
  const size = getPictureWorldDimensions(picture, assets);
  if (!size) return false;
  const { x, y } = picture.position;
  if (
    point.x < x - tolerance ||
    point.x > x + size.width + tolerance ||
    point.y < y - tolerance ||
    point.y > y + size.height + tolerance
  )
    return false;
  if (settings.click === "border") {
    return (
      getPictureSelectionSegments(picture, assets, settings.boundary) ?? []
    ).some(([from, to]) => {
      const closest = getClosestPointOnLineSegment(point, from, to);
      return Math.hypot(point.x - closest.x, point.y - closest.y) <= tolerance;
    });
  }
  if (settings.boundary === "rectangle" || (picture.texture && picture.mask)) {
    return (
      point.x >= x &&
      point.x <= x + size.width &&
      point.y >= y &&
      point.y <= y + size.height
    );
  }
  return isWorldPointInPictureVisiblePixel(point, picture, assets);
}
