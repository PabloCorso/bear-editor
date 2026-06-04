import { standardSprites } from "~/components/standard-sprites";
import type { LgrAssets } from "~/components/lgr-assets";
import { colors, ELMA_PIXEL_SCALE, OBJECT_DIAMETER } from "~/editor/constants";
import {
  defaultBikeCoords,
  getKuskiSelectionCircles,
} from "~/editor/kuski-geometry";
import { Clip, Gravity } from "~/editor/elma-types";
import {
  rotateMatrix,
  scaleMatrix,
  transformPoint,
  translateMatrix,
  type AffineMatrix,
} from "~/editor/render/affine-math";
import { getObjectFrame, getObjectSprite } from "~/editor/render/object-assets";
import { PICTURE_SCALE } from "~/editor/render/picture-metrics";
import { buildWebGLBikePose } from "~/editor/render/webgl-bike-pose";
import { type WebGLRenderContext } from "~/editor/render/webgl-render-context";
import { WebGLShapeDrawer } from "~/editor/render/webgl-shape-drawer";
import type {
  WorldPoint,
  WorldRenderDrawItem,
  WorldRenderObjectItem,
  WorldRenderPictureItem,
  WorldRenderScene,
} from "~/editor/render/world-scene";

const GRAVITY_ARROW_ROTATIONS = {
  [Gravity.Up]: 0,
  [Gravity.Down]: Math.PI,
  [Gravity.Left]: -Math.PI / 2,
  [Gravity.Right]: Math.PI / 2,
} as const;

export class WebGLWorldItemDrawer {
  private shapes: WebGLShapeDrawer;

  constructor(
    private context: WebGLRenderContext,
    private lgrAssets: LgrAssets | null,
  ) {
    this.shapes = new WebGLShapeDrawer(context);
  }

  setLgrAssets(lgrAssets: LgrAssets | null) {
    this.lgrAssets = lgrAssets;
  }

  drawQueuedItems(scene: WorldRenderScene, phase: "ground" | "rest") {
    for (const item of scene.drawItems) {
      const isGroundClippedPicture =
        item.type === "picture" && item.clip === Clip.Ground;
      if (
        phase === "ground" ? !isGroundClippedPicture : isGroundClippedPicture
      ) {
        continue;
      }

      this.withItemClip(item, scene, () => {
        this.drawItem(item, scene, { drawBounds: false });
      });
    }
  }

  drawQueuedItemBounds(scene: WorldRenderScene) {
    for (const item of scene.drawItems) {
      this.drawItemBounds(item, scene);
    }
  }

  private withItemClip(
    item: WorldRenderDrawItem,
    scene: WorldRenderScene,
    draw: () => void,
  ) {
    if (
      item.type !== "picture" &&
      item.type !== "object" &&
      item.type !== "start"
    ) {
      draw();
      return;
    }

    if (
      item.clip !== Clip.Sky &&
      (item.clip !== Clip.Ground || !shouldClipGroundToSkyPolygons(scene))
    ) {
      draw();
      return;
    }

    const gl = this.context.gl;
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0x00);
    gl.stencilFunc(item.clip === Clip.Sky ? gl.NOTEQUAL : gl.EQUAL, 0, 0xff);
    draw();
    gl.disable(gl.STENCIL_TEST);
  }

  private drawItem(
    item: WorldRenderDrawItem,
    scene: WorldRenderScene,
    { drawBounds = true }: { drawBounds?: boolean } = {},
  ) {
    if (item.type === "picture") {
      if (item.draft && item.clip !== Clip.Unclipped) {
        this.drawPicture(
          item,
          scene,
          item.opacity != null ? item.opacity * 0.35 : 0.35,
          drawBounds,
        );
        this.withItemClip({ ...item, draft: false }, scene, () => {
          this.drawPicture(item, scene, undefined, drawBounds);
        });
        return;
      }

      this.drawPicture(item, scene, undefined, drawBounds);
      return;
    }

    if (item.type === "object") {
      this.drawObject(item, scene, drawBounds);
      return;
    }

    if (item.type === "start") {
      this.drawStart(item, scene, drawBounds);
      return;
    }

    this.drawBike(item, scene);
  }

  private drawItemBounds(item: WorldRenderDrawItem, scene: WorldRenderScene) {
    if (item.type === "object") {
      if (!item.showBounds) return;

      this.shapes.drawCircleOutline(
        item.position,
        OBJECT_DIAMETER / 2,
        item.boundsLineWidth ?? 0.02,
        colors.selection,
        scene,
      );
      return;
    }

    if (item.type === "start") {
      if (!item.showBounds) return;

      for (const circle of getKuskiSelectionCircles({
        start: item.position,
        coords: defaultBikeCoords,
      })) {
        this.shapes.drawCircleOutline(
          { x: circle.x, y: circle.y },
          circle.radius,
          item.boundsLineWidth ?? 0.02,
          colors.selection,
          scene,
        );
      }
      return;
    }

    if (item.type !== "picture" || !item.showBounds) return;

    const dimensions = this.getPictureWorldDimensions(item);
    if (!dimensions) return;

    this.shapes.drawRectOutline(
      item.position.x,
      item.position.y,
      dimensions.width,
      dimensions.height,
      item.boundsLineWidth ?? 0.02,
      colors.selection,
      scene,
    );
  }

  private drawPicture(
    item: WorldRenderPictureItem,
    scene: WorldRenderScene,
    opacityOverride?: number,
    drawBounds = true,
  ) {
    if (!this.lgrAssets) return;
    const opacity = opacityOverride ?? item.opacity ?? 1;
    const picture = this.getPictureSprite(item, scene);
    const dimensions = this.getPictureWorldDimensions(item);
    if (!picture && (!drawBounds || !item.showBounds || !dimensions)) return;

    if (picture?.kind === "masked") {
      const width = dimensions?.width ?? picture.mask.width * PICTURE_SCALE;
      const height = dimensions?.height ?? picture.mask.height * PICTURE_SCALE;
      this.drawMaskedTexturedRect({
        textureSprite: picture.texture,
        maskSprite: picture.mask,
        x: item.position.x,
        y: item.position.y,
        width,
        height,
        opacity,
        scene,
      });

      if (drawBounds && item.showBounds) {
        this.shapes.drawRectOutline(
          item.position.x,
          item.position.y,
          width,
          height,
          item.boundsLineWidth ?? 0.02,
          colors.selection,
          scene,
        );
      }
      return;
    }

    const width = dimensions?.width ?? picture!.sprite.width * PICTURE_SCALE;
    const height = dimensions?.height ?? picture!.sprite.height * PICTURE_SCALE;

    if (picture) {
      this.drawTexturedRect({
        sprite: picture.sprite,
        sourceX: 0,
        sourceY: 0,
        sourceWidth: picture.sprite.width,
        sourceHeight: picture.sprite.height,
        x: item.position.x,
        y: item.position.y,
        width,
        height,
        opacity,
        scene,
      });
    }

    if (drawBounds && item.showBounds) {
      this.shapes.drawRectOutline(
        item.position.x,
        item.position.y,
        width,
        height,
        item.boundsLineWidth ?? 0.02,
        colors.selection,
        scene,
      );
    }
  }

  private getPictureWorldDimensions(item: WorldRenderPictureItem) {
    if (!this.lgrAssets) return null;

    if (item.texture && item.mask) {
      const maskSprite = this.lgrAssets.getSprite(item.mask);
      if (!maskSprite) return null;

      return {
        width: maskSprite.width * PICTURE_SCALE,
        height: maskSprite.height * PICTURE_SCALE,
      };
    }

    const sprite = item.name ? this.lgrAssets.getSprite(item.name) : null;
    if (!sprite) return null;

    return {
      width: sprite.width * PICTURE_SCALE,
      height: sprite.height * PICTURE_SCALE,
    };
  }

  private getPictureSprite(
    item: WorldRenderPictureItem,
    scene: WorldRenderScene,
  ):
    | {
        kind: "masked";
        texture: ImageBitmap;
        mask: ImageBitmap;
      }
    | {
        kind: "sprite";
        sprite: ImageBitmap;
      }
    | null {
    if (!this.lgrAssets) return null;

    if (item.texture && item.mask) {
      if (!scene.visibility.showTextures && !item.forceVisible) return null;

      const textureSprite = this.lgrAssets.getSprite(item.texture);
      const maskSprite = this.lgrAssets.getSprite(item.mask);
      if (!textureSprite || !maskSprite) return null;

      return {
        kind: "masked",
        texture: textureSprite,
        mask: maskSprite,
      };
    }

    if (!scene.visibility.showPictures && !item.forceVisible) return null;
    const sprite = item.name ? this.lgrAssets.getSprite(item.name) : null;
    if (!sprite) return null;

    return {
      kind: "sprite",
      sprite,
    };
  }

  private drawObject(
    item: WorldRenderObjectItem,
    scene: WorldRenderScene,
    drawBounds = true,
  ) {
    if (!this.lgrAssets) return;
    const shouldShowBounds = item.showBounds ?? false;
    if (
      !scene.visibility.showObjects &&
      !shouldShowBounds &&
      !item.forceVisible
    ) {
      return;
    }

    const sprite = getObjectSprite(this.lgrAssets, {
      kind: item.objectKind,
      animation: item.animation,
    });
    if (scene.visibility.showObjects || item.forceVisible) {
      if (!sprite) return;

      const frame = getObjectFrame(sprite, {
        animate: scene.animateSprites && scene.visibility.showObjectAnimations,
      });
      this.drawTexturedRect({
        sprite,
        sourceX: frame.sourceX,
        sourceY: frame.sourceY,
        sourceWidth: frame.sourceWidth,
        sourceHeight: frame.sourceHeight,
        x: item.position.x - frame.targetWidth / 2,
        y: item.position.y - frame.targetHeight / 2,
        width: frame.targetWidth,
        height: frame.targetHeight,
        opacity: item.opacity ?? 1,
        scene,
      });

      if (item.gravity != null) {
        const gravityArrowOpacity =
          item.objectKind === "apple" && item.forceVisible
            ? 1
            : (item.opacity ?? 1);
        this.drawGravityArrow(
          item.position,
          item.gravity,
          gravityArrowOpacity,
          scene,
        );
      }
    }

    if (drawBounds && shouldShowBounds) {
      this.shapes.drawCircleOutline(
        item.position,
        OBJECT_DIAMETER / 2,
        item.boundsLineWidth ?? 0.02,
        colors.selection,
        scene,
      );
    }
  }

  private drawStart(
    item: Extract<WorldRenderScene["drawItems"][number], { type: "start" }>,
    scene: WorldRenderScene,
    drawBounds = true,
  ) {
    const shouldShowBounds = item.showBounds ?? false;
    if (!scene.visibility.showObjects && !shouldShowBounds) return;

    const kuskiSprites = this.lgrAssets?.getKuskiSprites();
    const hasKuskiSprites = kuskiSprites
      ? standardSprites.kuski.every((spriteName) => kuskiSprites[spriteName])
      : false;

    if (scene.visibility.showObjects) {
      if (kuskiSprites && hasKuskiSprites) {
        this.drawKuski(
          {
            type: "bike",
            distance: item.distance,
            start: item.position,
            coords: defaultBikeCoords,
            fallback: {
              bike: item.position,
              leftWheel: item.position,
              rightWheel: item.position,
              head: item.position,
              flipped: false,
              rotation: 0,
            },
          },
          scene,
          kuskiSprites as Record<string, ImageBitmap>,
        );
      } else {
        this.shapes.drawCircle(
          item.position,
          OBJECT_DIAMETER / 2,
          colors.start,
          scene,
        );
      }
    }

    if (drawBounds && shouldShowBounds) {
      for (const circle of getKuskiSelectionCircles({
        start: item.position,
        coords: defaultBikeCoords,
      })) {
        this.shapes.drawCircleOutline(
          { x: circle.x, y: circle.y },
          circle.radius,
          item.boundsLineWidth ?? 0.02,
          colors.selection,
          scene,
        );
      }
    }
  }

  private drawBikeFallback(
    fallback: Extract<
      WorldRenderScene["drawItems"][number],
      { type: "bike" }
    >["fallback"],
    scene: WorldRenderScene,
  ) {
    const lineWidth = 2 / Math.max(scene.viewport.zoom, 1);
    this.shapes.drawLine(
      fallback.leftWheel,
      fallback.bike,
      lineWidth,
      "#111111",
      scene,
    );
    this.shapes.drawLine(
      fallback.rightWheel,
      fallback.bike,
      lineWidth,
      "#111111",
      scene,
    );
    this.shapes.drawLine(
      fallback.bike,
      fallback.head,
      lineWidth,
      "#111111",
      scene,
    );
    this.shapes.drawCircle(fallback.leftWheel, 0.26, "#111111", scene);
    this.shapes.drawCircle(fallback.rightWheel, 0.26, "#111111", scene);
    this.shapes.drawCircle(fallback.head, 0.16, "#f5d0a9", scene);
  }

  private drawBike(
    item: Extract<WorldRenderScene["drawItems"][number], { type: "bike" }>,
    scene: WorldRenderScene,
  ) {
    const kuskiSprites = this.lgrAssets?.getKuskiSprites();
    const hasKuskiSprites = kuskiSprites
      ? standardSprites.kuski.every((spriteName) => kuskiSprites[spriteName])
      : false;

    if (!kuskiSprites || !hasKuskiSprites) {
      this.drawBikeFallback(item.fallback, scene);
      return;
    }

    this.drawKuski(item, scene, kuskiSprites as Record<string, ImageBitmap>);
  }

  private drawKuski(
    item: Extract<WorldRenderScene["drawItems"][number], { type: "bike" }>,
    scene: WorldRenderScene,
    lgrSprites: Record<string, ImageBitmap>,
  ) {
    const coords = item.coords;
    const pose = buildWebGLBikePose({
      start: item.start,
      coords,
    });

    this.drawTransformedSprite(lgrSprites.q1wheel, pose.backWheelMatrix, scene);
    this.drawTransformedSprite(
      lgrSprites.q1wheel,
      pose.frontWheelMatrix,
      scene,
    );

    const hbarsX = -21.5;
    const hbarsY = -17;
    this.drawSkewedSprite({
      sprite: lgrSprites.q1susp1,
      matrix: pose.suspensionMatrix,
      bx: 2,
      by: 0.5,
      br: 5,
      ih: 6,
      x1: pose.frontSuspensionTarget.x,
      y1: pose.frontSuspensionTarget.y,
      x2: hbarsX,
      y2: hbarsY,
      scene,
    });

    this.drawSkewedSprite({
      sprite: lgrSprites.q1susp2,
      matrix: pose.suspensionMatrix,
      bx: 0,
      by: 0.5,
      br: 5,
      ih: 6,
      x1: 9,
      y1: 20,
      x2: pose.rearSuspensionTarget.x,
      y2: pose.rearSuspensionTarget.y,
      scene,
    });

    this.drawTransformedSprite(
      lgrSprites.q1bike,
      scaleMatrix(
        rotateMatrix(
          translateMatrix(
            pose.bikeMatrix,
            elmaPixelsToWorldUnits(-43),
            elmaPixelsToWorldUnits(-12),
          ),
          -Math.PI * 0.197,
        ),
        elmaPixelsToWorldUnits(0.215815 * 380),
        elmaPixelsToWorldUnits(0.215815 * 301),
      ),
      scene,
    );

    this.drawTransformedSprite(lgrSprites.q1head, pose.headMatrix, scene);

    const bumx = elmaPixelsToWorldUnits(19.5);
    const bumy = 0;
    this.drawKuskiLimb({
      matrix: pose.kuskiMatrix,
      firstSprite: lgrSprites.q1thigh,
      firstLength: elmaPixelsToWorldUnits(26.25),
      firstBx: 0,
      firstBy: 0.6,
      firstBr: elmaPixelsToWorldUnits(6),
      firstIh: thirdElmaPixelsToWorldUnits(39.4),
      secondSprite: lgrSprites.q1leg,
      secondLength: 1 - elmaPixelsToWorldUnits(26.25),
      secondBx: thirdElmaPixelsToWorldUnits(5),
      secondBy: 0.45,
      secondBr: elmaPixelsToWorldUnits(4),
      secondIh: thirdElmaPixelsToWorldUnits(60),
      x1: bumx,
      y1: bumy,
      x2: pose.pedalTarget.x,
      y2: pose.pedalTarget.y,
      clockwiseInner: false,
      scene,
    });

    this.drawTransformedSprite(lgrSprites.q1body, pose.bodyMatrix, scene);

    let handx = pose.handlebarTarget.x;
    let handy = pose.handlebarTarget.y;

    const voltProgress = coords.voltProgress ?? 0;
    const voltDirection = coords.voltDirection;
    if (voltProgress > 0 && voltDirection) {
      const sameDirection = (voltDirection === "right" ? 1 : 0) === coords.turn;
      const animx = pose.shoulder.x;
      const animy = pose.shoulder.y;
      let dangle: number;
      let ascale: number;
      let easedProgress = voltProgress;

      if (sameDirection) {
        if (easedProgress >= 0.25) {
          easedProgress = 0.25 - (0.25 * (easedProgress - 0.25)) / 0.75;
        }
        dangle = 10.8 * easedProgress;
        ascale = 1 - 1.2 * easedProgress;
      } else {
        if (easedProgress >= 0.2) {
          easedProgress = 0.2 - (0.2 * (easedProgress - 0.2)) / 0.8;
        }
        dangle = -8 * easedProgress;
        ascale = 1 + 0.75 * easedProgress;
      }

      const at =
        Math.atan2(
          pose.handlebarTarget.y - animy,
          pose.handlebarTarget.x - animx,
        ) + dangle;
      const dist =
        ascale *
        Math.hypot(
          pose.handlebarTarget.y - animy,
          pose.handlebarTarget.x - animx,
        );
      handx = animx + dist * Math.cos(at);
      handy = animy + dist * Math.sin(at);
    }

    this.drawKuskiLimb({
      matrix: pose.kuskiMatrix,
      firstSprite: lgrSprites.q1up_arm,
      firstLength: 0.3234,
      firstBx: thirdElmaPixelsToWorldUnits(12.2),
      firstBy: 0.5,
      firstBr: thirdElmaPixelsToWorldUnits(13),
      firstIh: thirdElmaPixelsToWorldUnits(-32),
      secondSprite: lgrSprites.q1forarm,
      secondLength: 0.3444,
      secondBx: elmaPixelsToWorldUnits(3),
      secondBy: 0.5,
      secondBr: thirdElmaPixelsToWorldUnits(13.2),
      secondIh: thirdElmaPixelsToWorldUnits(22.8),
      x1: pose.shoulder.x,
      y1: pose.shoulder.y,
      x2: handx,
      y2: handy,
      clockwiseInner: true,
      scene,
    });
  }

  private drawKuskiLimb({
    matrix,
    firstSprite,
    firstLength,
    firstBx,
    firstBy,
    firstBr,
    firstIh,
    secondSprite,
    secondLength,
    secondBx,
    secondBy,
    secondBr,
    secondIh,
    x1,
    y1,
    x2,
    y2,
    clockwiseInner,
    scene,
  }: {
    matrix: AffineMatrix;
    firstSprite: ImageBitmap;
    firstLength: number;
    firstBx: number;
    firstBy: number;
    firstBr: number;
    firstIh: number;
    secondSprite: ImageBitmap;
    secondLength: number;
    secondBx: number;
    secondBy: number;
    secondBr: number;
    secondIh: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    clockwiseInner: boolean;
    scene: WorldRenderScene;
  }) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    let adjustedFirstLength = firstLength;
    const prod =
      (dist + adjustedFirstLength + secondLength) *
      (dist - adjustedFirstLength + secondLength) *
      (dist + adjustedFirstLength - secondLength) *
      (-dist + adjustedFirstLength + secondLength);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    let jointAngle = 0;
    if (prod >= 0 && dist < adjustedFirstLength + secondLength) {
      const circumRadius =
        (dist * adjustedFirstLength * secondLength) / Math.sqrt(prod);
      jointAngle = Math.asin(secondLength / (2 * circumRadius));
    } else {
      adjustedFirstLength =
        (adjustedFirstLength / (adjustedFirstLength + secondLength)) * dist;
    }

    if (clockwiseInner) {
      jointAngle *= -1;
    }

    const jointx = x1 + adjustedFirstLength * Math.cos(angle + jointAngle);
    const jointy = y1 + adjustedFirstLength * Math.sin(angle + jointAngle);

    this.drawSkewedSprite({
      sprite: firstSprite,
      matrix,
      bx: firstBx,
      by: firstBy,
      br: firstBr,
      ih: firstIh,
      x1: jointx,
      y1: jointy,
      x2: x1,
      y2: y1,
      scene,
    });
    this.drawSkewedSprite({
      sprite: secondSprite,
      matrix,
      bx: secondBx,
      by: secondBy,
      br: secondBr,
      ih: secondIh,
      x1: x2,
      y1: y2,
      x2: jointx,
      y2: jointy,
      scene,
    });
  }

  private drawSkewedSprite({
    sprite,
    matrix,
    bx,
    by,
    br,
    ih,
    x1,
    y1,
    x2,
    y2,
    scene,
  }: {
    sprite: ImageBitmap;
    matrix: AffineMatrix;
    bx: number;
    by: number;
    br: number;
    ih: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    scene: WorldRenderScene;
  }) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    let drawMatrix = translateMatrix(matrix, x1, y1);
    drawMatrix = rotateMatrix(drawMatrix, Math.atan2(dy, dx));
    drawMatrix = translateMatrix(drawMatrix, -bx, -by * ih);
    drawMatrix = scaleMatrix(drawMatrix, bx + br + length, ih);
    this.drawTransformedSprite(sprite, drawMatrix, scene);
  }

  private drawTransformedSprite(
    sprite: ImageBitmap | HTMLCanvasElement,
    matrix: AffineMatrix,
    scene: WorldRenderScene,
    opacity = 1,
  ) {
    const topLeft = transformPoint(matrix, 0, 0);
    const topRight = transformPoint(matrix, 1, 0);
    const bottomLeft = transformPoint(matrix, 0, 1);
    const bottomRight = transformPoint(matrix, 1, 1);

    this.context.drawVertices({
      vertices: [
        topLeft.x,
        topLeft.y,
        0,
        0,
        topRight.x,
        topRight.y,
        1,
        0,
        bottomLeft.x,
        bottomLeft.y,
        0,
        1,
        bottomLeft.x,
        bottomLeft.y,
        0,
        1,
        topRight.x,
        topRight.y,
        1,
        0,
        bottomRight.x,
        bottomRight.y,
        1,
        1,
      ],
      color: [1, 1, 1, opacity],
      texture: this.context.getTexture(sprite),
      scene,
    });
  }

  private drawTexturedRect({
    sprite,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
    opacity,
    scene,
  }: {
    sprite: ImageBitmap | HTMLCanvasElement;
    sourceX: number;
    sourceY: number;
    sourceWidth: number;
    sourceHeight: number;
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
    scene: WorldRenderScene;
  }) {
    const texture = this.context.getTexture(sprite);
    const u0 = sourceX / sprite.width;
    const v0 = sourceY / sprite.height;
    const u1 = (sourceX + sourceWidth) / sprite.width;
    const v1 = (sourceY + sourceHeight) / sprite.height;
    const points = [
      { x, y, u: u0, v: v0 },
      { x: x + width, y, u: u1, v: v0 },
      { x, y: y + height, u: u0, v: v1 },
      { x, y: y + height, u: u0, v: v1 },
      { x: x + width, y, u: u1, v: v0 },
      { x: x + width, y: y + height, u: u1, v: v1 },
    ];

    this.context.drawVertices({
      vertices: points.flatMap((point) => [point.x, point.y, point.u, point.v]),
      color: [1, 1, 1, opacity],
      texture,
      scene,
    });
  }

  private drawMaskedTexturedRect({
    textureSprite,
    maskSprite,
    x,
    y,
    width,
    height,
    opacity,
    scene,
  }: {
    textureSprite: ImageBitmap;
    maskSprite: ImageBitmap;
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
    scene: WorldRenderScene;
  }) {
    const texture = this.context.getTexture(textureSprite);
    const maskTexture = this.context.getTexture(maskSprite);
    const { tileWidth, tileHeight } = getTextureTileSize(textureSprite, scene);
    const points = [
      {
        x,
        y,
        u: x / tileWidth,
        v: y / tileHeight,
        maskU: 0,
        maskV: 0,
      },
      {
        x: x + width,
        y,
        u: (x + width) / tileWidth,
        v: y / tileHeight,
        maskU: 1,
        maskV: 0,
      },
      {
        x,
        y: y + height,
        u: x / tileWidth,
        v: (y + height) / tileHeight,
        maskU: 0,
        maskV: 1,
      },
      {
        x,
        y: y + height,
        u: x / tileWidth,
        v: (y + height) / tileHeight,
        maskU: 0,
        maskV: 1,
      },
      {
        x: x + width,
        y,
        u: (x + width) / tileWidth,
        v: y / tileHeight,
        maskU: 1,
        maskV: 0,
      },
      {
        x: x + width,
        y: y + height,
        u: (x + width) / tileWidth,
        v: (y + height) / tileHeight,
        maskU: 1,
        maskV: 1,
      },
    ];

    this.context.drawVerticesWithMask({
      vertices: points.flatMap((point) => [
        point.x,
        point.y,
        point.u,
        point.v,
        point.maskU,
        point.maskV,
      ]),
      color: [1, 1, 1, opacity],
      texture,
      maskTexture,
      scene,
    });
  }

  private drawGravityArrow(
    position: WorldPoint,
    gravity: Gravity,
    opacity: number,
    scene: WorldRenderScene,
  ) {
    if (gravity === Gravity.None) return;

    const rotation = GRAVITY_ARROW_ROTATIONS[gravity];
    if (rotation == null) return;

    const size = OBJECT_DIAMETER / 6;
    const lineWidth = size * (72 / 96);
    const capRadius = lineWidth / 2;
    const basePoints = [
      { x: -size, y: size / 2 },
      { x: 0, y: -size / 3 },
      { x: size, y: size / 2 },
    ];
    const minY = Math.min(...basePoints.map((point) => point.y));
    const maxY = Math.max(...basePoints.map((point) => point.y));
    const centerY = (minY + maxY) / 2;
    const points = basePoints.map((point) => ({
      x:
        position.x +
        point.x * Math.cos(rotation) -
        (point.y - centerY) * Math.sin(rotation),
      y:
        position.y +
        point.x * Math.sin(rotation) +
        (point.y - centerY) * Math.cos(rotation),
    }));

    const leftBase = points[0]!;
    const tip = points[1]!;
    const rightBase = points[2]!;

    this.shapes.drawLine(leftBase, tip, lineWidth, "#fde047", scene, opacity);
    this.shapes.drawLine(tip, rightBase, lineWidth, "#fde047", scene, opacity);
    this.shapes.drawCircle(leftBase, capRadius, "#fde047", scene, opacity);
    this.shapes.drawCircle(tip, capRadius, "#fde047", scene, opacity);
    this.shapes.drawCircle(rightBase, capRadius, "#fde047", scene, opacity);
  }
}

function getTextureTileSize(
  sprite: ImageBitmap | HTMLCanvasElement,
  scene: WorldRenderScene,
) {
  if (scene.visibility.zoomTextures) {
    return {
      tileWidth: sprite.width * PICTURE_SCALE || 1,
      tileHeight: sprite.height * PICTURE_SCALE || 1,
    };
  }

  return {
    tileWidth: sprite.width / Math.max(scene.viewport.zoom, 0.0001),
    tileHeight: sprite.height / Math.max(scene.viewport.zoom, 0.0001),
  };
}

function shouldClipGroundToSkyPolygons(scene: WorldRenderScene) {
  return scene.groundClipMode === "always" || scene.visibility.showPolygons;
}

function elmaPixelsToWorldUnits(pixels: number) {
  return pixels * ELMA_PIXEL_SCALE;
}

function thirdElmaPixelsToWorldUnits(pixels: number) {
  return elmaPixelsToWorldUnits(pixels) / 3;
}
