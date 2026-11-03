import type { Position } from "./elma-types";
import type { EditorStore } from "./editor-store";
import type { WorldRect } from "./render/world-geometry";

export type ReferenceImage = {
  id: string;
  name: string;
  bitmap: ImageBitmap;
  position: Position;
  width: number;
  height: number;
  rotation: number;
};

export function referenceImagePoint(
  image: ReferenceImage,
  x: number,
  y: number,
): Position {
  const cos = Math.cos(image.rotation);
  const sin = Math.sin(image.rotation);
  return {
    x: image.position.x + x * cos - y * sin,
    y: image.position.y + x * sin + y * cos,
  };
}

export function getReferenceImageCorners(image: ReferenceImage): Position[] {
  return [
    referenceImagePoint(image, -image.width / 2, -image.height / 2),
    referenceImagePoint(image, image.width / 2, -image.height / 2),
    referenceImagePoint(image, image.width / 2, image.height / 2),
    referenceImagePoint(image, -image.width / 2, image.height / 2),
  ];
}

export function isPointInReferenceImage(
  image: ReferenceImage,
  point: Position,
): boolean {
  const dx = point.x - image.position.x;
  const dy = point.y - image.position.y;
  const cos = Math.cos(image.rotation);
  const sin = Math.sin(image.rotation);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  return (
    Math.abs(localX) <= image.width / 2 && Math.abs(localY) <= image.height / 2
  );
}

export function referenceImageIntersectsRect(
  image: ReferenceImage,
  rect: WorldRect,
): boolean {
  const imageCorners = getReferenceImageCorners(image);
  const rectCorners = [
    { x: rect.minX, y: rect.minY },
    { x: rect.maxX, y: rect.minY },
    { x: rect.maxX, y: rect.maxY },
    { x: rect.minX, y: rect.maxY },
  ];
  const axes = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: Math.cos(image.rotation), y: Math.sin(image.rotation) },
    { x: -Math.sin(image.rotation), y: Math.cos(image.rotation) },
  ];

  return axes.every((axis) => {
    const imageProjection = imageCorners.map(
      (point) => point.x * axis.x + point.y * axis.y,
    );
    const rectProjection = rectCorners.map(
      (point) => point.x * axis.x + point.y * axis.y,
    );
    return (
      Math.max(...imageProjection) >= Math.min(...rectProjection) &&
      Math.max(...rectProjection) >= Math.min(...imageProjection)
    );
  });
}

export function getReferenceImageTransform(
  image: ReferenceImage,
  corners: Position[],
): Pick<ReferenceImage, "position" | "width" | "height" | "rotation"> {
  const [topLeft, topRight, , bottomLeft] = corners;
  if (!topLeft || !topRight || !bottomLeft) {
    return {
      position: image.position,
      width: image.width,
      height: image.height,
      rotation: image.rotation,
    };
  }
  return {
    position: {
      x: corners.reduce((sum, corner) => sum + corner.x, 0) / corners.length,
      y: corners.reduce((sum, corner) => sum + corner.y, 0) / corners.length,
    },
    width: Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y),
    height: Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y),
    rotation: Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x),
  };
}

export async function importReferenceImage(
  store: EditorStore,
  file: File,
  viewport: { width: number; height: number },
) {
  if (
    !/\.(png|jpe?g|webp)$/i.test(file.name) ||
    (file.type &&
      !["image/png", "image/jpeg", "image/webp"].includes(file.type))
  ) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > 25 * 1024 * 1024)
    throw new Error("Choose an image smaller than 25 MB.");
  const session = store.getState().documentSession;
  // Decode locally and cap the uploaded texture size for large photographs.
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 40_000_000) {
    bitmap.close();
    throw new Error("Choose an image with fewer than 40 million pixels.");
  }
  let asset = bitmap;
  const ratio = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  if (ratio < 1) {
    try {
      asset = await createImageBitmap(bitmap, {
        resizeWidth: Math.max(1, Math.round(bitmap.width * ratio)),
        resizeHeight: Math.max(1, Math.round(bitmap.height * ratio)),
      });
    } finally {
      bitmap.close();
    }
  }
  const state = store.getState();
  if (state.documentSession.clipboardSessionId !== session.clipboardSessionId) {
    asset.close();
    return;
  }
  const scale =
    Math.min(
      (viewport.width * 0.6) / asset.width,
      (viewport.height * 0.6) / asset.height,
    ) / state.zoom;
  const image: ReferenceImage = {
    id: crypto.randomUUID(),
    name: file.name,
    bitmap: asset,
    position: {
      x: (viewport.width / 2 - state.viewPortOffset.x) / state.zoom,
      y: (viewport.height / 2 - state.viewPortOffset.y) / state.zoom,
    },
    width: asset.width * scale,
    height: asset.height * scale,
    rotation: 0,
  };
  store.setState({
    referenceImages: [...state.referenceImages, image],
  });
  const nextState = store.getState();
  nextState.actions.activateTool("select");
  nextState.actions.setToolState("select", {
    selectedVertices: [],
    selectedObjects: [image.position],
    selectedPictures: [],
    transformMode: false,
    contextMenuType: undefined,
    contextMenuPosition: undefined,
  });
}
