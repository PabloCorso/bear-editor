export const ELMA_PIXELS_PER_WORLD_UNIT = 48;
export const ELMA_PIXEL_SCALE = 1 / ELMA_PIXELS_PER_WORLD_UNIT;
export const OBJECT_FRAME_PX = 40; // width of a single frame in object sprite sheet
export const OBJECT_FPS = 30; // animation speed for object sprites
export const OBJECT_DIAMETER = 0.8;
export const GRASS_BASELINE_PX = 41;
export const QGRASS_TOP_EXTRA_PX = 18;
export const GRASS_FILL_DEPTH = 20 * ELMA_PIXEL_SCALE;
export const DRAFT_PREVIEW_OPACITY = 0.5;

export const selectionThresholds = {
  object: 15,
  vertex: 10,
  polygonEdge: 8,
} as const;

export const uiSelectionHandle = {
  halfWidthPx: 3,
  strokeWidthPx: 0.75,
  cornerRadiusPx: 2,
} as const;

export const selectionRenderLimits = {
  maxIndividualHandles: 400,
} as const;

export const colors = {
  apple: "#dc0000",
  edges: "#5ec8ff",
  flower: "#eaeaea",
  brick: "#85100d",
  sky: "#3078bc",
  ground: "#181048",
  stone1: "#7e3e1c",
  stone2: "#687878",
  stone3: "#03310a",
  killer: "#080808",
  selection: "#5ec8ff",
  start: "#309c30",
  grass: "#00ff00",
};

export const uiColors = {
  selectionHandleFill: "#ffffff",
  selectionHandleStroke: "#5ec8ff",
  boundsIdle: "#5ec8ff",
  boundsHover: "#ffffff",
  boundsSelected: "#5ec8ff",
  marqueeFill: "rgba(94, 200, 255, 0.16)",
  marqueeStroke: "#5ec8ff",
  pictureBounds: "#5ec8ff",
  objectBounds: "#5ec8ff",
  gravityArrow: "#fde047",
  vertexDraftLine: "#5ec8ff",
  vertexDraftGrassLine: "#5ec8ff",
  vertexDraftPointFill: "#ffffff",
  vertexDraftPointStroke: "#1b3b5c",
  vertexDraftClosingLine: "#5ec8ff",
};

export const uiStrokeWidths = {
  boundsIdleScreen: 1,
  boundsHoverScreen: 1.5,
  boundsSelectedScreen: 2.2,
};

export const debugColors = {
  distanceLabel: "#ffff00",
  panelFill: "rgba(0, 0, 0, 0.7)",
  panelText: "#ffffff",
  kuskiBounds: "#a855f7",
};
