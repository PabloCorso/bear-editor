import type { Position } from "./elma-types";
import type { EditorStore } from "./editor-store";

export type ReferenceImage = {
  id: string;
  name: string;
  bitmap: ImageBitmap;
  position: Position;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
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
    opacity: 0.65,
    locked: false,
    visible: true,
  };
  state.actions.activateTool("select");
  state.actions.setToolState("select", {
    selectedVertices: [],
    selectedObjects: [],
    selectedPictures: [],
    transformMode: false,
    contextMenuType: undefined,
  });
  store.setState({
    referenceImages: [...state.referenceImages, image],
    selectedReferenceImageId: image.id,
  });
}
