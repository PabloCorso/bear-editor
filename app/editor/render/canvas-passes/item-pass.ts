import { uiColors } from "~/editor/constants";
import { drawKuski, drawKuskiBounds } from "~/editor/draw-kuski";
import {
  drawGravityArrow,
  drawObject,
  drawObjectBounds,
} from "~/editor/draw-object";
import { drawPicture } from "~/editor/draw-picture";
import { Clip } from "~/editor/elma-types";
import { getMaskedTextureCanvas } from "~/editor/render/canvas-picture-cache";
import { getObjectSprite } from "~/editor/render/object-assets";
import { PICTURE_SCALE } from "~/editor/render/picture-metrics";
import type {
  WorldRenderDrawItem,
  WorldRenderObjectItem,
  WorldRenderPictureItem,
  WorldRenderScene,
} from "~/editor/render/world-scene";
import { drawBikePass } from "./bike-pass";
import type { CanvasWorldRenderContext } from "./canvas-render-context";

export function drawQueuedItemsPass({
  ctx,
  scene,
  lgrAssets,
  skyPath,
  groundPath,
  phase,
}: CanvasWorldRenderContext & {
  skyPath: Path2D;
  groundPath: Path2D;
  phase: "ground" | "rest";
}) {
  for (const item of scene.drawItems) {
    const isGroundClippedPicture =
      item.type === "picture" && item.clip === Clip.Ground;
    if (phase === "ground" ? !isGroundClippedPicture : isGroundClippedPicture) {
      continue;
    }

    if (item.type === "picture" && item.draft) {
      renderDraftPicturePreview({
        ctx,
        scene,
        lgrAssets,
        item,
        skyPath,
        groundPath,
      });
      continue;
    }

    ctx.save();

    if (
      (item.type === "picture" || item.type === "object" || item.type === "start") &&
      item.clip === Clip.Sky
    ) {
      ctx.clip(skyPath, "evenodd");
    } else if (
      (item.type === "picture" || item.type === "object" || item.type === "start") &&
      item.clip === Clip.Ground
    ) {
      ctx.clip(groundPath, "evenodd");
    }

    drawItem(ctx, scene, lgrAssets, item);
    ctx.restore();
  }
}

function renderDraftPicturePreview({
  ctx,
  scene,
  lgrAssets,
  item,
  skyPath,
  groundPath,
}: CanvasWorldRenderContext & {
  item: WorldRenderPictureItem;
  skyPath: Path2D;
  groundPath: Path2D;
}) {
  const baseOpacity = item.opacity ?? 1;
  const unclippedOpacity =
    item.clip === Clip.Unclipped ? baseOpacity : baseOpacity * 0.35;

  ctx.save();
  drawItem(ctx, scene, lgrAssets, item, {
    opacity: unclippedOpacity,
    showBounds: true,
  });
  ctx.restore();

  if (item.clip === Clip.Unclipped) {
    return;
  }

  ctx.save();
  if (item.clip === Clip.Sky) {
    ctx.clip(skyPath, "evenodd");
  } else if (item.clip === Clip.Ground) {
    ctx.clip(groundPath, "evenodd");
  }
  drawItem(ctx, scene, lgrAssets, item, {
    opacity: baseOpacity,
    showBounds: false,
  });
  ctx.restore();
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  scene: WorldRenderScene,
  lgrAssets: CanvasWorldRenderContext["lgrAssets"],
  item: WorldRenderDrawItem,
  pictureOptions?: {
    opacity?: number;
    showBounds?: boolean;
  },
) {
  if (item.type === "picture") {
    drawPictureItem(ctx, scene, lgrAssets, item, pictureOptions);
    return;
  }

  if (item.type === "object") {
    drawObjectItem(ctx, scene, lgrAssets, item);
    return;
  }

  if (item.type === "start") {
    drawStartItem(ctx, scene, lgrAssets, item);
    return;
  }

  drawBikePass(ctx, item, lgrAssets);
}

function drawPictureItem(
  ctx: CanvasRenderingContext2D,
  scene: WorldRenderScene,
  lgrAssets: CanvasWorldRenderContext["lgrAssets"],
  item: WorldRenderPictureItem,
  pictureOptions?: {
    opacity?: number;
    showBounds?: boolean;
  },
) {
  const pictureOpacity = pictureOptions?.opacity ?? item.opacity;
  const showBounds = pictureOptions?.showBounds ?? item.showBounds;

  if (item.texture && item.mask) {
    if (!scene.visibility.showTextures && !item.forceVisible) return;
    if (!lgrAssets) return;

    const textureSprite = lgrAssets.getSprite(item.texture);
    const maskSprite = lgrAssets.getSprite(item.mask);
    if (!textureSprite || !maskSprite) return;

    const maskedCanvas = getMaskedTextureCanvas({
      cacheKey: item.cacheKey ?? item,
      textureSprite,
      maskSprite,
      position: item.position,
    });
    if (!maskedCanvas) return;

    const prevImageSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = pictureOpacity ?? 1;
    ctx.drawImage(
      maskedCanvas,
      0,
      0,
      maskedCanvas.width,
      maskedCanvas.height,
      item.position.x,
      item.position.y,
      maskSprite.width * PICTURE_SCALE,
      maskSprite.height * PICTURE_SCALE,
    );
    if (showBounds) {
      ctx.strokeStyle = uiColors.pictureBounds;
      ctx.lineWidth = item.boundsLineWidth ?? 0.02;
      ctx.strokeRect(
        item.position.x,
        item.position.y,
        maskSprite.width * PICTURE_SCALE,
        maskSprite.height * PICTURE_SCALE,
      );
    }
    ctx.imageSmoothingEnabled = prevImageSmoothing;
    return;
  }

  if (!scene.visibility.showPictures && !item.forceVisible) return;
  if (!lgrAssets) return;

  const sprite = item.name ? lgrAssets.getSprite(item.name) : null;
  if (!sprite) return;

  drawPicture({
    ctx,
    sprite,
    position: item.position,
    opacity: pictureOpacity,
    showBounds,
    boundsLineWidth: item.boundsLineWidth,
  });
}

function drawObjectItem(
  ctx: CanvasRenderingContext2D,
  scene: WorldRenderScene,
  lgrAssets: CanvasWorldRenderContext["lgrAssets"],
  item: WorldRenderObjectItem,
) {
  const shouldShowBounds = item.showBounds ?? false;
  if (!scene.visibility.showObjects && !shouldShowBounds && !item.forceVisible) {
    return;
  }
  if (!lgrAssets) return;

  const sprite = getObjectSprite(lgrAssets, {
    kind: item.objectKind,
    animation: item.animation,
  });

  if (scene.visibility.showObjects || item.forceVisible) {
    if (!sprite) return;
    drawObject({
      ctx,
      sprite,
      position: item.position,
      animate: scene.animateSprites && scene.visibility.showObjectAnimations,
      opacity: item.opacity,
    });
    if (item.gravity != null) {
      drawGravityArrow({
        ctx,
        position: item.position,
        gravity: item.gravity,
        opacity: item.opacity,
      });
    }
  }

  if (shouldShowBounds) {
    drawObjectBounds({
      ctx,
      position: item.position,
      lineWidth: item.boundsLineWidth,
    });
  }
}

function drawStartItem(
  ctx: CanvasRenderingContext2D,
  scene: WorldRenderScene,
  lgrAssets: CanvasWorldRenderContext["lgrAssets"],
  item: Extract<WorldRenderDrawItem, { type: "start" }>,
) {
  const shouldShowBounds = item.showBounds ?? false;
  if (!scene.visibility.showObjects && !shouldShowBounds) return;
  if (!lgrAssets) return;

  if (scene.visibility.showObjects) {
    drawKuski({
      ctx,
      lgrSprites: lgrAssets.getKuskiSprites(),
      start: item.position,
    });
  }
  if (shouldShowBounds) {
    drawKuskiBounds({
      ctx,
      start: item.position,
      lineWidth: item.boundsLineWidth,
    });
  }
}
