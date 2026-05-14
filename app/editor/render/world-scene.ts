import type { BikeCoords } from "~/editor/kuski-geometry";
import type { Gravity } from "~/editor/elma-types";
import type { WorldRect } from "~/editor/render/world-geometry";

export type WorldPoint = {
  x: number;
  y: number;
};

export type WorldRenderVisibility = {
  useGroundSkyTextures: boolean;
  zoomTextures: boolean;
  showObjectAnimations: boolean;
  showObjects: boolean;
  showPictures: boolean;
  showTextures: boolean;
  showPolygons: boolean;
  showPolygonBounds: boolean;
};

export type WorldRenderViewport = {
  width: number;
  height: number;
  center: WorldPoint;
  rect: WorldRect;
  zoom: number;
};

export type WorldRenderPolygonItem = {
  vertices: WorldPoint[];
  isGrass: boolean;
  grassEdgeIndices: number[];
};

export type WorldRenderPictureItem = {
  type: "picture";
  name?: string;
  texture?: string;
  mask?: string;
  position: WorldPoint;
  distance: number;
  clip: number;
  opacity?: number;
  showBounds?: boolean;
  boundsLineWidth?: number;
  forceVisible?: boolean;
  draft?: boolean;
  cacheKey?: object;
};

export type WorldRenderObjectItem = {
  type: "object";
  objectKind: "apple" | "flower" | "killer" | "food" | "exit";
  position: WorldPoint;
  distance: number;
  clip: number;
  animation?: number;
  gravity?: Gravity;
  opacity?: number;
  showBounds?: boolean;
  boundsLineWidth?: number;
  forceVisible?: boolean;
};

export type WorldRenderStartItem = {
  type: "start";
  position: WorldPoint;
  distance: number;
  clip: number;
  opacity?: number;
  showBounds?: boolean;
  boundsLineWidth?: number;
};

export type WorldRenderBikeItem = {
  type: "bike";
  distance: number;
  start: WorldPoint;
  coords: BikeCoords;
  fallback: {
    bike: WorldPoint;
    leftWheel: WorldPoint;
    rightWheel: WorldPoint;
    head: WorldPoint;
    flipped: boolean;
    rotation: number;
  };
};

export type WorldRenderLineOverlay = {
  type: "line";
  from: WorldPoint;
  to: WorldPoint;
  color: string;
  width: number;
  opacity?: number;
  layer?: "default" | "top";
};

export type WorldRenderPolylineOverlay = {
  type: "polyline";
  points: WorldPoint[];
  closed?: boolean;
  color: string;
  width: number;
  opacity?: number;
  layer?: "default" | "top";
};

export type WorldRenderRectOverlay = {
  type: "rect";
  position: WorldPoint;
  width: number;
  height: number;
  cornerRadius?: number;
  fillColor?: string;
  strokeColor?: string;
  lineWidth?: number;
  opacity?: number;
  layer?: "default" | "top";
};

export type WorldRenderCircleOverlay = {
  type: "circle";
  center: WorldPoint;
  radius: number;
  fillColor?: string;
  strokeColor?: string;
  lineWidth?: number;
  opacity?: number;
  layer?: "default" | "top";
};

export type WorldRenderOverlayItem =
  | WorldRenderLineOverlay
  | WorldRenderPolylineOverlay
  | WorldRenderRectOverlay
  | WorldRenderCircleOverlay;

export type WorldRenderDrawItem =
  | WorldRenderPictureItem
  | WorldRenderObjectItem
  | WorldRenderStartItem
  | WorldRenderBikeItem;

export type WorldRenderScene = {
  clearColor: string;
  ground: string;
  sky: string;
  animateSprites: boolean;
  groundClipMode: "always" | "when-polygons-visible";
  viewport: WorldRenderViewport;
  visibility: WorldRenderVisibility;
  polygons: WorldRenderPolygonItem[];
  drawItems: WorldRenderDrawItem[];
  overlays?: WorldRenderOverlayItem[];
};
