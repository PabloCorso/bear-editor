import type { Apple, Polygon, Position } from "../elma-types";
import { calculateBoundingBox } from "./level-helpers";

const DEFAULT_FIT_TO_VIEW_ZOOM = 1;
const FIT_TO_VIEW_PADDING = 2;
const FIT_TO_VIEW_VIEWPORT_RATIO = 0.9;
const FOCUS_POSITIONS_PADDING = 2;
const FOCUS_POSITIONS_VIEWPORT_RATIO = 0.75;
const FOCUS_POSITIONS_MIN_SPAN = 6;

export function updateCamera({
  deltaX,
  deltaY,
  currentOffset,
  setCamera,
  panSpeed,
}: {
  deltaX: number;
  deltaY: number;
  currentOffset: { x: number; y: number };
  setCamera: (x: number, y: number) => void;
  panSpeed: number;
}) {
  setCamera(
    currentOffset.x + deltaX * panSpeed,
    currentOffset.y + deltaY * panSpeed,
  );
}

export function updateZoom({
  newZoom,
  minZoom,
  maxZoom,
  currentZoom,
  setZoom,
  anchor,
  currentOffset,
  setCamera,
}: {
  newZoom: number;
  minZoom: number;
  maxZoom: number;
  currentZoom: number;
  setZoom: (zoom: number) => void;
  anchor?: { x: number; y: number };
  currentOffset?: { x: number; y: number };
  setCamera?: (x: number, y: number) => void;
}) {
  const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));

  if (clampedZoom !== currentZoom) {
    setZoom(clampedZoom);

    // Adjust viewport to keep mouse position fixed if coordinates provided
    if (anchor && currentOffset && setCamera) {
      adjustViewportForZoom({
        anchor,
        oldZoom: currentZoom,
        newZoom: clampedZoom,
        currentOffset,
        setCamera,
      });
    }
  }
}

function adjustViewportForZoom({
  anchor,
  oldZoom,
  newZoom,
  currentOffset,
  setCamera,
}: {
  anchor: { x: number; y: number };
  oldZoom: number;
  newZoom: number;
  currentOffset: { x: number; y: number };
  setCamera: (x: number, y: number) => void;
}) {
  // Convert screen coordinates to world coordinates
  const worldX = (anchor.x - currentOffset.x) / oldZoom;
  const worldY = (anchor.y - currentOffset.y) / oldZoom;

  // Calculate new camera offset to keep the same world position under the mouse
  const newOffsetX = anchor.x - worldX * newZoom;
  const newOffsetY = anchor.y - worldY * newZoom;

  setCamera(newOffsetX, newOffsetY);
}

export function fitToView({
  canvas,
  polygons,
  apples,
  killers,
  flowers,
  start,
  minZoom,
  maxZoom,
  setCamera,
  setZoom,
}: {
  canvas: HTMLCanvasElement;
  polygons: Polygon[];
  apples: Apple[];
  killers: Position[];
  flowers: Position[];
  start: Position;
  minZoom: number;
  maxZoom: number;
  setCamera: (x: number, y: number) => void;
  setZoom: (zoom: number) => void;
}) {
  let { minX, minY, maxX, maxY } = calculateBoundingBox({
    polygons,
    apples,
    killers,
    flowers,
    start,
  });

  // If no polygons and no objects, center on origin
  if (minX === Infinity || maxX === -Infinity) {
    setCamera(canvas.width / 2, canvas.height / 2);
    setZoom(Math.max(minZoom, Math.min(maxZoom, DEFAULT_FIT_TO_VIEW_ZOOM)));
    return;
  }

  // Add padding
  minX -= FIT_TO_VIEW_PADDING;
  minY -= FIT_TO_VIEW_PADDING;
  maxX += FIT_TO_VIEW_PADDING;
  maxY += FIT_TO_VIEW_PADDING;

  // Calculate center and size
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const polygonWidth = maxX - minX;
  const polygonHeight = maxY - minY;

  // Calculate optimal zoom
  const zoomX = (canvas.width * FIT_TO_VIEW_VIEWPORT_RATIO) / polygonWidth;
  const zoomY = (canvas.height * FIT_TO_VIEW_VIEWPORT_RATIO) / polygonHeight;
  const newZoom = Math.max(minZoom, Math.min(maxZoom, Math.min(zoomX, zoomY)));

  // Set camera and zoom
  const viewPortX = canvas.width / 2 - centerX * newZoom;
  const viewPortY = canvas.height / 2 - centerY * newZoom;
  setCamera(viewPortX, viewPortY);
  setZoom(newZoom);
}

export function focusPositionsInView({
  positions,
  viewportWidth,
  viewportHeight,
  minZoom,
  maxZoom,
  setCamera,
  setZoom,
}: {
  positions: Position[];
  viewportWidth: number;
  viewportHeight: number;
  minZoom: number;
  maxZoom: number;
  setCamera: (x: number, y: number) => void;
  setZoom: (zoom: number) => void;
}) {
  if (positions.length === 0) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  positions.forEach((position) => {
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return;

  minX -= FOCUS_POSITIONS_PADDING;
  minY -= FOCUS_POSITIONS_PADDING;
  maxX += FOCUS_POSITIONS_PADDING;
  maxY += FOCUS_POSITIONS_PADDING;

  const width = Math.max(FOCUS_POSITIONS_MIN_SPAN, maxX - minX);
  const height = Math.max(FOCUS_POSITIONS_MIN_SPAN, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const zoomX = (viewportWidth * FOCUS_POSITIONS_VIEWPORT_RATIO) / width;
  const zoomY = (viewportHeight * FOCUS_POSITIONS_VIEWPORT_RATIO) / height;
  const newZoom = Math.max(minZoom, Math.min(maxZoom, Math.min(zoomX, zoomY)));

  setCamera(
    viewportWidth / 2 - centerX * newZoom,
    viewportHeight / 2 - centerY * newZoom,
  );
  setZoom(newZoom);
}

export function getDevicePixelSnappedViewportCenter({
  centerX,
  centerY,
  width,
  height,
  zoom,
  devicePixelRatio,
}: {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  zoom: number;
  devicePixelRatio: number;
}) {
  const unitsPerDevicePixel = 1 / Math.max(zoom * devicePixelRatio, 0.0001);
  const halfWidth = width / (2 * zoom);
  const halfHeight = height / (2 * zoom);
  const minX = snapToGrid(centerX - halfWidth, unitsPerDevicePixel);
  const minY = snapToGrid(centerY - halfHeight, unitsPerDevicePixel);

  return {
    x: minX + halfWidth,
    y: minY + halfHeight,
  };
}

function snapToGrid(value: number, gridSize: number) {
  return Math.round(value / gridSize) * gridSize;
}
