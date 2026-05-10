import { colors } from "~/editor/constants";
import { PICTURE_SCALE } from "~/editor/render/picture-metrics";
import type { CanvasWorldRenderContext } from "./canvas-render-context";

export function drawGroundFillPass({
  ctx,
  lgrAssets,
  scene,
  groundPath,
}: CanvasWorldRenderContext & {
  groundPath: Path2D;
}) {
  const groundPattern = scene.visibility.useGroundSkyTextures
    ? getTexturePattern(ctx, lgrAssets, scene.ground)
    : null;
  const groundColor = getFlatTextureColor(scene.ground, colors.ground);

  ctx.save();
  ctx.fillStyle = groundPattern ?? groundColor;
  ctx.fill(groundPath, "evenodd");
  ctx.restore();
}

function getTexturePattern(
  ctx: CanvasRenderingContext2D,
  lgrAssets: CanvasWorldRenderContext["lgrAssets"],
  textureName: string,
) {
  if (!lgrAssets) return null;

  const textureSprite = lgrAssets.getSprite(textureName);
  if (!textureSprite) return null;

  const pattern = ctx.createPattern(textureSprite, "repeat");
  if (!pattern) return null;

  pattern.setTransform(new DOMMatrix().scale(PICTURE_SCALE, PICTURE_SCALE));
  return pattern;
}

function getFlatTextureColor(textureName: string, fallback: string) {
  const textureColor = colors[textureName as keyof typeof colors];
  return textureColor ?? fallback;
}
