import { standardSprites } from "~/components/standard-sprites";
import { drawKuski } from "~/editor/draw-kuski";
import type { WorldRenderBikeItem } from "~/editor/render/world-scene";
import type { CanvasWorldRenderContext } from "./canvas-render-context";

export function drawBikePass(
  ctx: CanvasRenderingContext2D,
  item: WorldRenderBikeItem,
  lgrAssets: CanvasWorldRenderContext["lgrAssets"],
) {
  const kuskiSprites = lgrAssets?.getKuskiSprites();
  const hasKuskiSprites = kuskiSprites
    ? standardSprites.kuski.every((spriteName) => kuskiSprites[spriteName])
    : false;
  if (kuskiSprites && hasKuskiSprites) {
    drawKuski({
      ctx,
      lgrSprites: kuskiSprites,
      start: item.start,
      coords: item.coords,
    });
    return;
  }

  drawBikeFallback(ctx, item);
}

function drawBikeFallback(ctx: CanvasRenderingContext2D, item: WorldRenderBikeItem) {
  const { leftWheel, rightWheel, bike, head, flipped, rotation } =
    item.fallback;
  const headRadius = 0.238;
  const torsoToHeadX = head.x - bike.x;
  const torsoToHeadY = head.y - bike.y;
  const torsoToHeadLength = Math.hypot(torsoToHeadX, torsoToHeadY) || 1;
  const neckX = head.x - (torsoToHeadX / torsoToHeadLength) * headRadius * 0.9;
  const neckY = head.y - (torsoToHeadY / torsoToHeadLength) * headRadius * 0.9;

  drawWheelFallback(
    ctx,
    leftWheel.x,
    leftWheel.y,
    0.4,
    (item.coords.leftR * Math.PI * 2) / 250,
  );
  drawWheelFallback(
    ctx,
    rightWheel.x,
    rightWheel.y,
    0.4,
    (item.coords.rightR * Math.PI * 2) / 250,
  );

  ctx.beginPath();
  ctx.moveTo(leftWheel.x, leftWheel.y);
  ctx.lineTo(bike.x, bike.y);
  ctx.lineTo(rightWheel.x, rightWheel.y);
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 0.04;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(bike.x, bike.y);
  ctx.lineTo(neckX, neckY);
  ctx.strokeStyle = "#ffaa00";
  ctx.lineWidth = 0.05;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(head.x, head.y, headRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#ffcc88";
  ctx.fill();

  const facingDirection = flipped ? 1 : -1;
  const bikeAxisX = Math.cos(rotation);
  const bikeAxisY = -Math.sin(rotation);
  const bikeUpX = -Math.sin(rotation);
  const bikeUpY = -Math.cos(rotation);
  const eyeX =
    head.x +
    bikeAxisX * headRadius * 0.58 * facingDirection +
    bikeUpX * headRadius * 0.08;
  const eyeY =
    head.y +
    bikeAxisY * headRadius * 0.58 * facingDirection +
    bikeUpY * headRadius * 0.08;

  ctx.beginPath();
  ctx.arc(eyeX, eyeY, headRadius * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = "#2b1d14";
  ctx.fill();
}

function drawWheelFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "#00cc00";
  ctx.lineWidth = 0.03;
  ctx.stroke();

  for (let spokeIndex = 0; spokeIndex < 4; spokeIndex += 1) {
    const spokeAngle = rotation + (spokeIndex * Math.PI) / 2;
    const spokeEndX = x + Math.cos(spokeAngle) * radius;
    const spokeEndY = y - Math.sin(spokeAngle) * radius;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(spokeEndX, spokeEndY);
    ctx.stroke();
  }
}
