import { standardSprites } from "~/components/standard-sprites";
import type { LgrAssets } from "~/components/lgr-assets";
import {
  colors,
  ELMA_PIXEL_SCALE,
  OBJECT_DIAMETER,
  QGRASS_TOP_EXTRA_PX,
} from "~/editor/constants";
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
import type {
  WorldPoint,
  WorldRenderDrawItem,
  WorldRenderOverlayItem,
  WorldRenderObjectItem,
  WorldRenderPictureItem,
  WorldRenderScene,
} from "~/editor/render/world-scene";
import type { WorldSceneRenderer } from "~/editor/render/world-scene-renderer";

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
attribute vec2 a_maskTexCoord;

uniform vec4 u_viewRect;

varying vec2 v_texCoord;
varying vec2 v_maskTexCoord;

void main() {
  vec2 viewSize = max(u_viewRect.zw - u_viewRect.xy, vec2(0.0001));
  vec2 normalized = (a_position - u_viewRect.xy) / viewSize;
  gl_Position = vec4(normalized * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
  v_texCoord = a_texCoord;
  v_maskTexCoord = a_maskTexCoord;
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

uniform bool u_useTexture;
uniform bool u_useMaskTexture;
uniform bool u_repeatTexture;
uniform vec4 u_color;
uniform sampler2D u_texture;
uniform sampler2D u_maskTexture;

varying vec2 v_texCoord;
varying vec2 v_maskTexCoord;

void main() {
  vec4 color = u_color;
  if (u_useTexture) {
    vec2 texCoord = u_repeatTexture ? fract(v_texCoord) : v_texCoord;
    color = texture2D(u_texture, texCoord) * u_color;
    if (u_useMaskTexture) {
      float maskAlpha = texture2D(u_maskTexture, v_maskTexCoord).a;
      color.a *= step(0.001, maskAlpha);
    }
  }
  gl_FragColor = color;
}
`;

type ProgramInfo = {
  program: WebGLProgram;
  maskTexCoordAttribute: number;
  positionAttribute: number;
  texCoordAttribute: number;
  colorUniform: WebGLUniformLocation;
  maskTextureUniform: WebGLUniformLocation;
  repeatTextureUniform: WebGLUniformLocation;
  useMaskTextureUniform: WebGLUniformLocation;
  useTextureUniform: WebGLUniformLocation;
  textureUniform: WebGLUniformLocation;
  viewRectUniform: WebGLUniformLocation;
};

const MIN_ZOOM_EPSILON = 0.0001;
const GRASS_TINY_CANVAS_UNIT_PX = 1;
const GRASS_COLLINEAR_DOT_THRESHOLD = 0.98;
const GRASS_JOIN_OVERLAP = ELMA_PIXEL_SCALE;
const GRAVITY_ARROW_ROTATIONS = {
  [Gravity.Up]: 0,
  [Gravity.Down]: Math.PI,
  [Gravity.Left]: -Math.PI / 2,
  [Gravity.Right]: Math.PI / 2,
} as const;

export class WebGLWorldSceneRenderer implements WorldSceneRenderer {
  readonly backend = "webgl" as const;

  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private programInfo: ProgramInfo;
  private vertexBuffer: WebGLBuffer;
  private lgrAssets: LgrAssets | null;
  private textureCache = new WeakMap<ImageBitmap, WebGLTexture>();
  private canvasTextureCache = new WeakMap<HTMLCanvasElement, WebGLTexture>();
  private textures = new Set<WebGLTexture>();

  constructor(canvas: HTMLCanvasElement, lgrAssets: LgrAssets | null) {
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: import.meta.env.DEV,
      stencil: true,
    });
    if (!gl) throw new Error("WebGL context missing");

    const vertexBuffer = gl.createBuffer();
    if (!vertexBuffer) throw new Error("Failed to create WebGL vertex buffer");

    this.canvas = canvas;
    this.gl = gl;
    this.lgrAssets = lgrAssets;
    this.vertexBuffer = vertexBuffer;
    this.programInfo = createProgramInfo(gl);

    gl.useProgram(this.programInfo.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.programInfo.textureUniform, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.uniform1i(this.programInfo.maskTextureUniform, 1);
    this.resetDrawState();
  }

  resize({
    width,
    height,
    devicePixelRatio = 1,
  }: {
    width: number;
    height: number;
    devicePixelRatio?: number;
  }) {
    this.canvas.width = width * devicePixelRatio;
    this.canvas.height = height * devicePixelRatio;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  render(scene: WorldRenderScene) {
    const gl = this.gl;
    const groundColor = getTextureColor(scene.ground, colors.ground);
    const skyColor = getTextureColor(scene.sky, colors.sky);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.resetDrawState();
    gl.clearColor(...hexToRgb(scene.clearColor), 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    this.drawWorldFill(scene, groundColor, scene.ground);

    this.writeSkyStencil(scene);
    this.drawQueuedItems(scene, "ground");

    if (scene.visibility.showPolygons) {
      this.drawSkyFillFromStencil(scene, skyColor, scene.sky);
      this.drawGrassPolygons(scene);
    }

    this.drawPolygonEdges(scene);
    this.drawQueuedItems(scene, "rest");
    this.drawOverlays(scene);
  }

  destroy() {
    for (const texture of this.textures) {
      this.gl.deleteTexture(texture);
    }
    this.textures.clear();
    this.gl.deleteBuffer(this.vertexBuffer);
    this.gl.deleteProgram(this.programInfo.program);
  }

  private writeSkyStencil(scene: WorldRenderScene) {
    const gl = this.gl;
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.STENCIL_TEST);
    gl.colorMask(false, false, false, false);
    gl.stencilMask(0xff);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);

    for (const polygon of scene.polygons) {
      if (polygon.vertices.length < 3 || polygon.isGrass) continue;
      this.drawPolygon(polygon.vertices, "#ffffff", scene);
    }

    gl.colorMask(true, true, true, true);
    gl.stencilMask(0x00);
    gl.disable(gl.STENCIL_TEST);
  }

  private drawSkyFillFromStencil(
    scene: WorldRenderScene,
    skyColor: string,
    skyTextureName: string,
  ) {
    const gl = this.gl;
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0x00);
    gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
    this.drawWorldFill(scene, skyColor, skyTextureName);
    gl.disable(gl.STENCIL_TEST);
  }

  private drawPolygonEdges(scene: WorldRenderScene) {
    if (!scene.visibility.showPolygonBounds) return;

    for (const polygon of scene.polygons) {
      if (polygon.vertices.length < 2) continue;

      const lineWidth = 1 / Math.max(scene.viewport.zoom, 1);
      if (polygon.isGrass) {
        for (const index of polygon.grassEdgeIndices) {
          const from = polygon.vertices[index]!;
          const to = polygon.vertices[(index + 1) % polygon.vertices.length]!;
          this.drawLine(from, to, lineWidth, colors.grass, scene);
        }
        continue;
      }

      for (let index = 0; index < polygon.vertices.length; index += 1) {
        const from = polygon.vertices[index]!;
        const to = polygon.vertices[(index + 1) % polygon.vertices.length]!;
        this.drawLine(from, to, lineWidth, colors.edges, scene);
      }
    }
  }

  private drawGrassPolygons(scene: WorldRenderScene) {
    for (const polygon of scene.polygons) {
      if (!polygon.isGrass || polygon.vertices.length < 3) continue;
      this.drawGrassPolygonFallback(polygon, scene);
    }
  }

  private drawGrassPolygonFallback(
    polygon: WorldRenderScene["polygons"][number],
    scene: WorldRenderScene,
  ) {
    const lineWidth = 1 / Math.max(scene.viewport.zoom, 1);
    const gl = this.gl;

    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0x00);
    gl.stencilFunc(gl.EQUAL, 0, 0xff);

    for (const [from, to, innerTo, innerFrom] of getSimpleGrassFillQuads({
      vertices: polygon.vertices,
      grassEdgeIndices: polygon.grassEdgeIndices,
      zoom: scene.viewport.zoom,
      depth: 20 * ELMA_PIXEL_SCALE,
    })) {
      this.drawLine(from, to, lineWidth, colors.grass, scene);
      this.drawQuad(
        [
          from.x,
          from.y,
          to.x,
          to.y,
          innerTo.x,
          innerTo.y,
          innerFrom.x,
          innerFrom.y,
        ],
        colors.grass,
        scene,
      );
    }

    gl.disable(gl.STENCIL_TEST);
  }

  private drawQueuedItems(scene: WorldRenderScene, phase: "ground" | "rest") {
    for (const item of scene.drawItems) {
      const isGroundClippedPicture =
        item.type === "picture" && item.clip === Clip.Ground;
      if (
        phase === "ground" ? !isGroundClippedPicture : isGroundClippedPicture
      ) {
        continue;
      }

      this.withItemClip(item, scene, () => {
        this.drawItem(item, scene);
      });
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

    const gl = this.gl;
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0x00);
    gl.stencilFunc(item.clip === Clip.Sky ? gl.NOTEQUAL : gl.EQUAL, 0, 0xff);
    draw();
    gl.disable(gl.STENCIL_TEST);
  }

  private drawItem(item: WorldRenderDrawItem, scene: WorldRenderScene) {
    if (item.type === "picture") {
      if (item.draft && item.clip !== Clip.Unclipped) {
        this.drawPicture(
          item,
          scene,
          item.opacity != null ? item.opacity * 0.35 : 0.35,
        );
        this.withItemClip({ ...item, draft: false }, scene, () => {
          this.drawPicture(item, scene);
        });
        return;
      }

      this.drawPicture(item, scene);
      return;
    }

    if (item.type === "object") {
      this.drawObject(item, scene);
      return;
    }

    if (item.type === "start") {
      this.drawStart(item, scene);
      return;
    }

    this.drawBike(item, scene);
  }

  private drawPicture(
    item: WorldRenderPictureItem,
    scene: WorldRenderScene,
    opacityOverride?: number,
  ) {
    if (!this.lgrAssets) return;
    const opacity = opacityOverride ?? item.opacity ?? 1;
    const picture = this.getPictureSprite(item, scene);
    if (!picture) return;

    if (picture.kind === "masked") {
      const width = picture.mask.width * PICTURE_SCALE;
      const height = picture.mask.height * PICTURE_SCALE;
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

      if (item.showBounds) {
        this.drawRectOutline(
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

    const width = picture.sprite.width * PICTURE_SCALE;
    const height = picture.sprite.height * PICTURE_SCALE;

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

    if (item.showBounds) {
      this.drawRectOutline(
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

  private drawObject(item: WorldRenderObjectItem, scene: WorldRenderScene) {
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
        this.drawGravityArrow(
          item.position,
          item.gravity,
          item.opacity ?? 1,
          scene,
        );
      }
    }

    if (shouldShowBounds) {
      this.drawCircleOutline(
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
        this.drawCircle(
          item.position,
          OBJECT_DIAMETER / 2,
          colors.start,
          scene,
        );
      }
    }

    if (shouldShowBounds) {
      for (const circle of getKuskiSelectionCircles({
        start: item.position,
        coords: defaultBikeCoords,
      })) {
        this.drawCircleOutline(
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
    this.drawLine(
      fallback.leftWheel,
      fallback.bike,
      lineWidth,
      "#111111",
      scene,
    );
    this.drawLine(
      fallback.rightWheel,
      fallback.bike,
      lineWidth,
      "#111111",
      scene,
    );
    this.drawLine(fallback.bike, fallback.head, lineWidth, "#111111", scene);
    this.drawCircle(fallback.leftWheel, 0.26, "#111111", scene);
    this.drawCircle(fallback.rightWheel, 0.26, "#111111", scene);
    this.drawCircle(fallback.head, 0.16, "#f5d0a9", scene);
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

    this.drawVertices(
      [
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
      [1, 1, 1, opacity],
      this.getTexture(sprite),
      scene,
    );
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
    const texture = this.getTexture(sprite);
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

    this.drawVertices(
      points.flatMap((point) => [point.x, point.y, point.u, point.v]),
      [1, 1, 1, opacity],
      texture,
      scene,
    );
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
    const texture = this.getTexture(textureSprite);
    const maskTexture = this.getTexture(maskSprite);
    const { tileWidth, tileHeight } = this.getTextureTileSize(
      textureSprite,
      scene,
    );
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

    this.drawVerticesWithMask(
      points.flatMap((point) => [
        point.x,
        point.y,
        point.u,
        point.v,
        point.maskU,
        point.maskV,
      ]),
      [1, 1, 1, opacity],
      texture,
      maskTexture,
      scene,
    );
  }

  private drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    scene: WorldRenderScene,
    opacity = 1,
  ) {
    const points = [
      { x, y },
      { x: x + width, y },
      { x, y: y + height },
      { x, y: y + height },
      { x: x + width, y },
      { x: x + width, y: y + height },
    ];
    this.drawVertices(
      points.flatMap((point) => [point.x, point.y, 0, 0]),
      colorToRgba(color, opacity),
      null,
      scene,
    );
  }

  private drawRectOutline(
    x: number,
    y: number,
    width: number,
    height: number,
    lineWidth: number,
    color: string,
    scene: WorldRenderScene,
    opacity = 1,
  ) {
    this.drawLine(
      { x, y },
      { x: x + width, y },
      lineWidth,
      color,
      scene,
      opacity,
    );
    this.drawLine(
      { x: x + width, y },
      { x: x + width, y: y + height },
      lineWidth,
      color,
      scene,
      opacity,
    );
    this.drawLine(
      { x: x + width, y: y + height },
      { x, y: y + height },
      lineWidth,
      color,
      scene,
      opacity,
    );
    this.drawLine(
      { x, y: y + height },
      { x, y },
      lineWidth,
      color,
      scene,
      opacity,
    );
  }

  private drawQuad(
    corners: [number, number, number, number, number, number, number, number],
    color: string,
    scene: WorldRenderScene,
  ) {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = corners;
    this.drawVertices(
      [
        x0,
        y0,
        0,
        0,
        x1,
        y1,
        0,
        0,
        x2,
        y2,
        0,
        0,
        x0,
        y0,
        0,
        0,
        x2,
        y2,
        0,
        0,
        x3,
        y3,
        0,
        0,
      ],
      [...hexToRgb(color), 1],
      null,
      scene,
    );
  }

  private drawWorldFill(
    scene: WorldRenderScene,
    color: string,
    textureName: string,
  ) {
    const textureSprite =
      scene.visibility.useGroundSkyTextures && this.lgrAssets
        ? this.lgrAssets.getSprite(textureName)
        : null;

    if (!textureSprite) {
      this.drawRect(
        scene.viewport.rect.minX,
        scene.viewport.rect.minY,
        scene.viewport.rect.maxX - scene.viewport.rect.minX,
        scene.viewport.rect.maxY - scene.viewport.rect.minY,
        color,
        scene,
      );
      return;
    }

    this.drawRepeatedTextureRect(textureSprite, scene);
  }

  private drawRepeatedTextureRect(
    sprite: ImageBitmap | HTMLCanvasElement,
    scene: WorldRenderScene,
  ) {
    const rect = scene.viewport.rect;
    const texture = this.getTexture(sprite);
    const { tileWidth, tileHeight } = this.getTextureTileSize(sprite, scene);
    const points = [
      {
        x: rect.minX,
        y: rect.minY,
        u: rect.minX / tileWidth,
        v: rect.minY / tileHeight,
      },
      {
        x: rect.maxX,
        y: rect.minY,
        u: rect.maxX / tileWidth,
        v: rect.minY / tileHeight,
      },
      {
        x: rect.minX,
        y: rect.maxY,
        u: rect.minX / tileWidth,
        v: rect.maxY / tileHeight,
      },
      {
        x: rect.minX,
        y: rect.maxY,
        u: rect.minX / tileWidth,
        v: rect.maxY / tileHeight,
      },
      {
        x: rect.maxX,
        y: rect.minY,
        u: rect.maxX / tileWidth,
        v: rect.minY / tileHeight,
      },
      {
        x: rect.maxX,
        y: rect.maxY,
        u: rect.maxX / tileWidth,
        v: rect.maxY / tileHeight,
      },
    ];

    this.drawVertices(
      points.flatMap((point) => [point.x, point.y, point.u, point.v]),
      [1, 1, 1, 1],
      texture,
      scene,
      true,
    );
  }

  private getTextureTileSize(
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
      tileWidth: sprite.width / Math.max(scene.viewport.zoom, MIN_ZOOM_EPSILON),
      tileHeight:
        sprite.height / Math.max(scene.viewport.zoom, MIN_ZOOM_EPSILON),
    };
  }

  private drawPolygon(
    vertices: WorldPoint[],
    color: string,
    scene: WorldRenderScene,
  ) {
    const triangles: number[] = [];
    for (const [firstIndex, secondIndex, thirdIndex] of getCachedTriangulation(
      vertices,
    )) {
      const first = vertices[firstIndex]!;
      const second = vertices[secondIndex]!;
      const third = vertices[thirdIndex]!;
      triangles.push(
        first.x,
        first.y,
        0,
        0,
        second.x,
        second.y,
        0,
        0,
        third.x,
        third.y,
        0,
        0,
      );
    }

    this.drawVertices(triangles, [...hexToRgb(color), 1], null, scene);
  }

  private drawLine(
    from: WorldPoint,
    to: WorldPoint,
    width: number,
    color: string,
    scene: WorldRenderScene,
    opacity = 1,
  ) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;

    const nx = (-dy / length) * (width / 2);
    const ny = (dx / length) * (width / 2);
    const points = [
      { x: from.x + nx, y: from.y + ny },
      { x: from.x - nx, y: from.y - ny },
      { x: to.x + nx, y: to.y + ny },
      { x: to.x + nx, y: to.y + ny },
      { x: from.x - nx, y: from.y - ny },
      { x: to.x - nx, y: to.y - ny },
    ];
    this.drawVertices(
      points.flatMap((point) => [point.x, point.y, 0, 0]),
      colorToRgba(color, opacity),
      null,
      scene,
    );
  }

  private drawCircle(
    center: WorldPoint,
    radius: number,
    color: string,
    scene: WorldRenderScene,
    opacity = 1,
  ) {
    const segments = 24;
    const vertices: number[] = [];
    for (let index = 0; index < segments; index += 1) {
      const a = (index / segments) * Math.PI * 2;
      const b = ((index + 1) / segments) * Math.PI * 2;
      const points = [
        center,
        {
          x: center.x + Math.cos(a) * radius,
          y: center.y + Math.sin(a) * radius,
        },
        {
          x: center.x + Math.cos(b) * radius,
          y: center.y + Math.sin(b) * radius,
        },
      ];
      vertices.push(...points.flatMap((point) => [point.x, point.y, 0, 0]));
    }
    this.drawVertices(vertices, colorToRgba(color, opacity), null, scene);
  }

  private drawCircleOutline(
    center: WorldPoint,
    radius: number,
    lineWidth: number,
    color: string,
    scene: WorldRenderScene,
    opacity = 1,
  ) {
    const segments = 24;
    const vertices: number[] = [];
    for (let index = 0; index < segments; index += 1) {
      const a = (index / segments) * Math.PI * 2;
      const b = ((index + 1) / segments) * Math.PI * 2;
      const outerA = {
        x: center.x + Math.cos(a) * (radius + lineWidth / 2),
        y: center.y + Math.sin(a) * (radius + lineWidth / 2),
      };
      const innerA = {
        x: center.x + Math.cos(a) * Math.max(0, radius - lineWidth / 2),
        y: center.y + Math.sin(a) * Math.max(0, radius - lineWidth / 2),
      };
      const outerB = {
        x: center.x + Math.cos(b) * (radius + lineWidth / 2),
        y: center.y + Math.sin(b) * (radius + lineWidth / 2),
      };
      const innerB = {
        x: center.x + Math.cos(b) * Math.max(0, radius - lineWidth / 2),
        y: center.y + Math.sin(b) * Math.max(0, radius - lineWidth / 2),
      };

      vertices.push(
        outerA.x,
        outerA.y,
        0,
        0,
        innerA.x,
        innerA.y,
        0,
        0,
        outerB.x,
        outerB.y,
        0,
        0,
        outerB.x,
        outerB.y,
        0,
        0,
        innerA.x,
        innerA.y,
        0,
        0,
        innerB.x,
        innerB.y,
        0,
        0,
      );
    }
    this.drawVertices(vertices, colorToRgba(color, opacity), null, scene);
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
    const lineWidth = 0.08;
    const basePoints = [
      { x: -size, y: size / 2 },
      { x: 0, y: -size / 2 },
      { x: size, y: size / 2 },
    ];
    const points = basePoints.map((point) => ({
      x:
        position.x +
        point.x * Math.cos(rotation) -
        point.y * Math.sin(rotation),
      y:
        position.y +
        point.x * Math.sin(rotation) +
        point.y * Math.cos(rotation),
    }));

    this.drawLine(points[0]!, points[1]!, lineWidth, "#fde047", scene, opacity);
    this.drawLine(points[1]!, points[2]!, lineWidth, "#fde047", scene, opacity);
  }

  private drawOverlays(scene: WorldRenderScene) {
    const filledRectBatches = new Map<string, number[]>();
    const lineBatches = new Map<string, number[]>();
    const filledCircleBatches = new Map<string, number[]>();
    const circleOutlineBatches = new Map<string, number[]>();

    for (const overlay of scene.overlays ?? []) {
      switch (overlay.type) {
        case "line":
          this.appendLineBatch(lineBatches, {
            from: overlay.from,
            to: overlay.to,
            width: overlay.width,
            color: overlay.color,
            opacity: overlay.opacity ?? 1,
          });
          break;
        case "polyline":
          this.appendPolylineBatch(lineBatches, overlay);
          break;
        case "rect":
          if (overlay.fillColor) {
            this.appendRectBatch(filledRectBatches, {
              x: overlay.position.x,
              y: overlay.position.y,
              width: overlay.width,
              height: overlay.height,
              color: overlay.fillColor,
              opacity: overlay.opacity ?? 1,
            });
          }
          if (overlay.strokeColor && overlay.lineWidth != null) {
            this.appendRectOutlineBatch(lineBatches, {
              x: overlay.position.x,
              y: overlay.position.y,
              width: overlay.width,
              height: overlay.height,
              lineWidth: overlay.lineWidth,
              color: overlay.strokeColor,
              opacity: overlay.opacity ?? 1,
            });
          }
          break;
        case "circle":
          if (overlay.fillColor) {
            this.appendCircleBatch(filledCircleBatches, {
              center: overlay.center,
              radius: overlay.radius,
              color: overlay.fillColor,
              opacity: overlay.opacity ?? 1,
            });
          }
          if (overlay.strokeColor && overlay.lineWidth != null) {
            this.appendCircleOutlineBatch(circleOutlineBatches, {
              center: overlay.center,
              radius: overlay.radius,
              lineWidth: overlay.lineWidth,
              color: overlay.strokeColor,
              opacity: overlay.opacity ?? 1,
            });
          }
          break;
      }
    }

    this.flushOverlayBatches(filledRectBatches, scene);
    this.flushOverlayBatches(lineBatches, scene);
    this.flushOverlayBatches(filledCircleBatches, scene);
    this.flushOverlayBatches(circleOutlineBatches, scene);
  }

  private appendRectBatch(
    batches: Map<string, number[]>,
    {
      x,
      y,
      width,
      height,
      color,
      opacity,
    }: {
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      opacity: number;
    },
  ) {
    const vertices = getOverlayBatchVertices(batches, color, opacity);
    appendRectVertices(vertices, x, y, width, height);
  }

  private appendRectOutlineBatch(
    batches: Map<string, number[]>,
    {
      x,
      y,
      width,
      height,
      lineWidth,
      color,
      opacity,
    }: {
      x: number;
      y: number;
      width: number;
      height: number;
      lineWidth: number;
      color: string;
      opacity: number;
    },
  ) {
    this.appendLineBatch(batches, {
      from: { x, y },
      to: { x: x + width, y },
      width: lineWidth,
      color,
      opacity,
    });
    this.appendLineBatch(batches, {
      from: { x: x + width, y },
      to: { x: x + width, y: y + height },
      width: lineWidth,
      color,
      opacity,
    });
    this.appendLineBatch(batches, {
      from: { x: x + width, y: y + height },
      to: { x, y: y + height },
      width: lineWidth,
      color,
      opacity,
    });
    this.appendLineBatch(batches, {
      from: { x, y: y + height },
      to: { x, y },
      width: lineWidth,
      color,
      opacity,
    });
  }

  private appendPolylineBatch(
    batches: Map<string, number[]>,
    overlay: Extract<WorldRenderOverlayItem, { type: "polyline" }>,
  ) {
    if (overlay.points.length < 2) return;

    for (let index = 1; index < overlay.points.length; index += 1) {
      this.appendLineBatch(batches, {
        from: overlay.points[index - 1]!,
        to: overlay.points[index]!,
        width: overlay.width,
        color: overlay.color,
        opacity: overlay.opacity ?? 1,
      });
    }

    if (overlay.closed) {
      this.appendLineBatch(batches, {
        from: overlay.points[overlay.points.length - 1]!,
        to: overlay.points[0]!,
        width: overlay.width,
        color: overlay.color,
        opacity: overlay.opacity ?? 1,
      });
    }
  }

  private appendLineBatch(
    batches: Map<string, number[]>,
    {
      from,
      to,
      width,
      color,
      opacity,
    }: {
      from: WorldPoint;
      to: WorldPoint;
      width: number;
      color: string;
      opacity: number;
    },
  ) {
    const vertices = getOverlayBatchVertices(
      batches,
      color,
      opacity,
      width.toFixed(6),
    );
    appendLineVertices(vertices, from, to, width);
  }

  private appendCircleBatch(
    batches: Map<string, number[]>,
    {
      center,
      radius,
      color,
      opacity,
    }: {
      center: WorldPoint;
      radius: number;
      color: string;
      opacity: number;
    },
  ) {
    const vertices = getOverlayBatchVertices(batches, color, opacity);
    appendCircleVertices(vertices, center, radius);
  }

  private appendCircleOutlineBatch(
    batches: Map<string, number[]>,
    {
      center,
      radius,
      lineWidth,
      color,
      opacity,
    }: {
      center: WorldPoint;
      radius: number;
      lineWidth: number;
      color: string;
      opacity: number;
    },
  ) {
    const vertices = getOverlayBatchVertices(
      batches,
      color,
      opacity,
      lineWidth.toFixed(6),
    );
    appendCircleOutlineVertices(vertices, center, radius, lineWidth);
  }

  private flushOverlayBatches(
    batches: Map<string, number[]>,
    scene: WorldRenderScene,
  ) {
    for (const [key, vertices] of batches) {
      const [color, opacityToken] = key.split("|");
      this.drawVertices(
        vertices,
        colorToRgba(color!, Number(opacityToken)),
        null,
        scene,
      );
    }
  }

  private drawVertices(
    vertices: number[],
    color: [number, number, number, number],
    texture: WebGLTexture | null,
    scene: WorldRenderScene,
    repeatTexture = false,
  ) {
    if (vertices.length === 0) return;

    const gl = this.gl;
    const programInfo = this.programInfo;
    gl.useProgram(programInfo.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    const expandedVertices = expandVerticesWithDefaultMask(vertices);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(expandedVertices),
      gl.STREAM_DRAW,
    );

    gl.enableVertexAttribArray(programInfo.positionAttribute);
    gl.vertexAttribPointer(
      programInfo.positionAttribute,
      2,
      gl.FLOAT,
      false,
      24,
      0,
    );
    gl.enableVertexAttribArray(programInfo.texCoordAttribute);
    gl.vertexAttribPointer(
      programInfo.texCoordAttribute,
      2,
      gl.FLOAT,
      false,
      24,
      8,
    );
    gl.enableVertexAttribArray(programInfo.maskTexCoordAttribute);
    gl.vertexAttribPointer(
      programInfo.maskTexCoordAttribute,
      2,
      gl.FLOAT,
      false,
      24,
      16,
    );

    gl.uniform4f(
      programInfo.viewRectUniform,
      scene.viewport.rect.minX,
      scene.viewport.rect.minY,
      scene.viewport.rect.maxX,
      scene.viewport.rect.maxY,
    );
    gl.uniform4fv(programInfo.colorUniform, color);
    gl.uniform1i(programInfo.useTextureUniform, texture ? 1 : 0);
    gl.uniform1i(programInfo.useMaskTextureUniform, 0);
    gl.uniform1i(programInfo.repeatTextureUniform, repeatTexture ? 1 : 0);
    if (texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }

    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 4);
  }

  private drawVerticesWithMask(
    vertices: number[],
    color: [number, number, number, number],
    texture: WebGLTexture,
    maskTexture: WebGLTexture,
    scene: WorldRenderScene,
  ) {
    if (vertices.length === 0) return;

    const gl = this.gl;
    const programInfo = this.programInfo;
    gl.useProgram(programInfo.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);

    gl.enableVertexAttribArray(programInfo.positionAttribute);
    gl.vertexAttribPointer(
      programInfo.positionAttribute,
      2,
      gl.FLOAT,
      false,
      24,
      0,
    );
    gl.enableVertexAttribArray(programInfo.texCoordAttribute);
    gl.vertexAttribPointer(
      programInfo.texCoordAttribute,
      2,
      gl.FLOAT,
      false,
      24,
      8,
    );
    gl.enableVertexAttribArray(programInfo.maskTexCoordAttribute);
    gl.vertexAttribPointer(
      programInfo.maskTexCoordAttribute,
      2,
      gl.FLOAT,
      false,
      24,
      16,
    );

    gl.uniform4f(
      programInfo.viewRectUniform,
      scene.viewport.rect.minX,
      scene.viewport.rect.minY,
      scene.viewport.rect.maxX,
      scene.viewport.rect.maxY,
    );
    gl.uniform4fv(programInfo.colorUniform, color);
    gl.uniform1i(programInfo.useTextureUniform, 1);
    gl.uniform1i(programInfo.useMaskTextureUniform, 1);
    gl.uniform1i(programInfo.repeatTextureUniform, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);

    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 6);
  }

  private resetDrawState() {
    const gl = this.gl;
    gl.useProgram(this.programInfo.program);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);
    gl.stencilMask(0xff);
    gl.stencilFunc(gl.ALWAYS, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
  }

  private getTexture(sprite: ImageBitmap | HTMLCanvasElement) {
    if (sprite instanceof HTMLCanvasElement) {
      return this.getCanvasTexture(sprite);
    }

    const cached = this.textureCache.get(sprite);
    if (cached) return cached;

    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Failed to create WebGL texture");

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sprite);

    this.textureCache.set(sprite, texture);
    this.textures.add(texture);
    return texture;
  }

  private getCanvasTexture(sprite: HTMLCanvasElement) {
    const gl = this.gl;
    const cached = this.canvasTextureCache.get(sprite);
    const texture = cached ?? gl.createTexture();
    if (!texture) throw new Error("Failed to create WebGL texture");

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sprite);

    if (!cached) {
      this.canvasTextureCache.set(sprite, texture);
      this.textures.add(texture);
    }
    return texture;
  }
}

function createProgramInfo(gl: WebGLRenderingContext): ProgramInfo {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    FRAGMENT_SHADER_SOURCE,
  );
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create WebGL program");

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(
      gl.getProgramInfoLog(program) ?? "Failed to link WebGL program",
    );
  }

  const colorUniform = gl.getUniformLocation(program, "u_color");
  const maskTextureUniform = gl.getUniformLocation(program, "u_maskTexture");
  const repeatTextureUniform = gl.getUniformLocation(
    program,
    "u_repeatTexture",
  );
  const useMaskTextureUniform = gl.getUniformLocation(
    program,
    "u_useMaskTexture",
  );
  const useTextureUniform = gl.getUniformLocation(program, "u_useTexture");
  const textureUniform = gl.getUniformLocation(program, "u_texture");
  const viewRectUniform = gl.getUniformLocation(program, "u_viewRect");
  if (
    !colorUniform ||
    !maskTextureUniform ||
    !repeatTextureUniform ||
    !useMaskTextureUniform ||
    !useTextureUniform ||
    !textureUniform ||
    !viewRectUniform
  ) {
    throw new Error("Failed to resolve WebGL program uniforms");
  }

  return {
    program,
    maskTexCoordAttribute: gl.getAttribLocation(program, "a_maskTexCoord"),
    positionAttribute: gl.getAttribLocation(program, "a_position"),
    texCoordAttribute: gl.getAttribLocation(program, "a_texCoord"),
    colorUniform,
    maskTextureUniform,
    repeatTextureUniform,
    useMaskTextureUniform,
    useTextureUniform,
    textureUniform,
    viewRectUniform,
  };
}

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create WebGL shader");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(
      gl.getShaderInfoLog(shader) ?? "Failed to compile WebGL shader",
    );
  }

  return shader;
}

function getTextureColor(textureName: string, fallback: string) {
  return colors[textureName as keyof typeof colors] ?? fallback;
}

function colorToRgba(
  color: string,
  opacity = 1,
): [number, number, number, number] {
  const [r, g, b] = hexToRgb(color);
  return [r, g, b, opacity];
}

function expandVerticesWithDefaultMask(vertices: number[]) {
  const expanded: number[] = [];
  for (let index = 0; index < vertices.length; index += 4) {
    expanded.push(
      vertices[index]!,
      vertices[index + 1]!,
      vertices[index + 2]!,
      vertices[index + 3]!,
      0,
      0,
    );
  }
  return expanded;
}

function getOverlayBatchVertices(
  batches: Map<string, number[]>,
  color: string,
  opacity: number,
  discriminator = "",
) {
  const key = [color, opacity.toFixed(4), discriminator].join("|");
  const existing = batches.get(key);
  if (existing) return existing;

  const vertices: number[] = [];
  batches.set(key, vertices);
  return vertices;
}

function appendRectVertices(
  vertices: number[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  vertices.push(
    x,
    y,
    0,
    0,
    x + width,
    y,
    0,
    0,
    x,
    y + height,
    0,
    0,
    x,
    y + height,
    0,
    0,
    x + width,
    y,
    0,
    0,
    x + width,
    y + height,
    0,
    0,
  );
}

function appendLineVertices(
  vertices: number[],
  from: WorldPoint,
  to: WorldPoint,
  width: number,
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return;

  const nx = (-dy / length) * (width / 2);
  const ny = (dx / length) * (width / 2);
  vertices.push(
    from.x + nx,
    from.y + ny,
    0,
    0,
    from.x - nx,
    from.y - ny,
    0,
    0,
    to.x + nx,
    to.y + ny,
    0,
    0,
    to.x + nx,
    to.y + ny,
    0,
    0,
    from.x - nx,
    from.y - ny,
    0,
    0,
    to.x - nx,
    to.y - ny,
    0,
    0,
  );
}

function appendCircleVertices(
  vertices: number[],
  center: WorldPoint,
  radius: number,
) {
  const segments = 24;
  for (let index = 0; index < segments; index += 1) {
    const a = (index / segments) * Math.PI * 2;
    const b = ((index + 1) / segments) * Math.PI * 2;
    vertices.push(
      center.x,
      center.y,
      0,
      0,
      center.x + Math.cos(a) * radius,
      center.y + Math.sin(a) * radius,
      0,
      0,
      center.x + Math.cos(b) * radius,
      center.y + Math.sin(b) * radius,
      0,
      0,
    );
  }
}

function appendCircleOutlineVertices(
  vertices: number[],
  center: WorldPoint,
  radius: number,
  lineWidth: number,
) {
  const segments = 24;
  for (let index = 0; index < segments; index += 1) {
    const a = (index / segments) * Math.PI * 2;
    const b = ((index + 1) / segments) * Math.PI * 2;
    const outerA = {
      x: center.x + Math.cos(a) * (radius + lineWidth / 2),
      y: center.y + Math.sin(a) * (radius + lineWidth / 2),
    };
    const innerA = {
      x: center.x + Math.cos(a) * Math.max(0, radius - lineWidth / 2),
      y: center.y + Math.sin(a) * Math.max(0, radius - lineWidth / 2),
    };
    const outerB = {
      x: center.x + Math.cos(b) * (radius + lineWidth / 2),
      y: center.y + Math.sin(b) * (radius + lineWidth / 2),
    };
    const innerB = {
      x: center.x + Math.cos(b) * Math.max(0, radius - lineWidth / 2),
      y: center.y + Math.sin(b) * Math.max(0, radius - lineWidth / 2),
    };

    vertices.push(
      outerA.x,
      outerA.y,
      0,
      0,
      innerA.x,
      innerA.y,
      0,
      0,
      outerB.x,
      outerB.y,
      0,
      0,
      outerB.x,
      outerB.y,
      0,
      0,
      innerA.x,
      innerA.y,
      0,
      0,
      innerB.x,
      innerB.y,
      0,
      0,
    );
  }
}

function elmaPixelsToWorldUnits(pixels: number) {
  return pixels * ELMA_PIXEL_SCALE;
}

function thirdElmaPixelsToWorldUnits(pixels: number) {
  return elmaPixelsToWorldUnits(pixels) / 3;
}

function shouldClipGroundToSkyPolygons(scene: WorldRenderScene) {
  return scene.groundClipMode === "always" || scene.visibility.showPolygons;
}

const triangulationCache = new WeakMap<
  WorldPoint[],
  Array<readonly [number, number, number]>
>();

function triangulatePolygon(vertices: WorldPoint[]) {
  if (vertices.length < 3) return [];
  if (vertices.length === 3) return [[0, 1, 2] as const];

  const indices = vertices.map((_, index) => index);
  const triangles: Array<readonly [number, number, number]> = [];
  const isClockwise = signedArea(vertices) < 0;
  let guard = vertices.length * vertices.length;

  while (indices.length > 3 && guard > 0) {
    guard -= 1;
    let clippedEar = false;

    for (let index = 0; index < indices.length; index += 1) {
      const previousIndex =
        indices[(index - 1 + indices.length) % indices.length]!;
      const currentIndex = indices[index]!;
      const nextIndex = indices[(index + 1) % indices.length]!;
      const previous = vertices[previousIndex]!;
      const current = vertices[currentIndex]!;
      const next = vertices[nextIndex]!;

      if (!isConvex(previous, current, next, isClockwise)) continue;

      const containsOtherVertex = indices.some((candidateIndex) => {
        if (
          candidateIndex === previousIndex ||
          candidateIndex === currentIndex ||
          candidateIndex === nextIndex
        ) {
          return false;
        }

        return isPointInTriangle(
          vertices[candidateIndex]!,
          previous,
          current,
          next,
        );
      });
      if (containsOtherVertex) continue;

      triangles.push([previousIndex, currentIndex, nextIndex]);
      indices.splice(index, 1);
      clippedEar = true;
      break;
    }

    if (!clippedEar) {
      return triangulatePolygonFan(vertices);
    }
  }

  if (indices.length === 3) {
    triangles.push([indices[0]!, indices[1]!, indices[2]!]);
  }

  return triangles;
}

function getCachedTriangulation(vertices: WorldPoint[]) {
  const cached = triangulationCache.get(vertices);
  if (cached) return cached;

  const computed = triangulatePolygon(vertices);
  triangulationCache.set(vertices, computed);
  return computed;
}

function triangulatePolygonFan(vertices: WorldPoint[]) {
  const triangles: Array<readonly [number, number, number]> = [];
  for (let index = 1; index < vertices.length - 1; index += 1) {
    triangles.push([0, index, index + 1]);
  }
  return triangles;
}

function getSimpleGrassFillQuads({
  vertices,
  grassEdgeIndices,
  zoom,
  depth,
}: {
  vertices: WorldPoint[];
  grassEdgeIndices: number[];
  zoom: number;
  depth: number;
}) {
  const tinyCanvasUnit =
    GRASS_TINY_CANVAS_UNIT_PX / Math.max(zoom, MIN_ZOOM_EPSILON);
  const grassEdgesSet = new Set(grassEdgeIndices);
  const vertexCount = vertices.length;
  const fillDepth = depth + QGRASS_TOP_EXTRA_PX * ELMA_PIXEL_SCALE;
  const quads: Array<
    readonly [WorldPoint, WorldPoint, WorldPoint, WorldPoint]
  > = [];

  for (const index of grassEdgeIndices) {
    const from = vertices[index]!;
    const to = vertices[(index + 1) % vertexCount]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) continue;

    const prevEdgeIndex = (index - 1 + vertexCount) % vertexCount;
    const nextEdgeIndex = (index + 1) % vertexCount;
    const hasPrevGrass = grassEdgesSet.has(prevEdgeIndex);
    const hasNextGrass = grassEdgesSet.has(nextEdgeIndex);
    const edgeDir = {
      x: (to.x - from.x) / length,
      y: (to.y - from.y) / length,
    };
    const edgeOverlap = Math.min(GRASS_JOIN_OVERLAP, length * 0.25);
    const prevFrom = vertices[prevEdgeIndex]!;
    const prevTo = vertices[index]!;
    const prevLength = Math.hypot(prevTo.x - prevFrom.x, prevTo.y - prevFrom.y);
    const nextFrom = vertices[(index + 1) % vertexCount]!;
    const nextTo = vertices[(index + 2) % vertexCount]!;
    const nextLength = Math.hypot(nextTo.x - nextFrom.x, nextTo.y - nextFrom.y);

    let fromX = from.x;
    let fromY = from.y;
    let toX = to.x;
    let toY = to.y;
    let fromExtend = 0;
    let toExtend = 0;

    if (hasPrevGrass && prevLength > 0) {
      const prevDir = {
        x: (prevTo.x - prevFrom.x) / prevLength,
        y: (prevTo.y - prevFrom.y) / prevLength,
      };
      const dot = prevDir.x * edgeDir.x + prevDir.y * edgeDir.y;
      if (dot >= GRASS_COLLINEAR_DOT_THRESHOLD) {
        fromExtend = edgeOverlap;
      }
    }

    if (hasNextGrass && nextLength > 0) {
      const nextDir = {
        x: (nextTo.x - nextFrom.x) / nextLength,
        y: (nextTo.y - nextFrom.y) / nextLength,
      };
      const dot = edgeDir.x * nextDir.x + edgeDir.y * nextDir.y;
      if (dot >= GRASS_COLLINEAR_DOT_THRESHOLD) {
        toExtend = edgeOverlap;
      }
    }

    if (hasPrevGrass && hasNextGrass) {
      toExtend = Math.max(toExtend, Math.min(tinyCanvasUnit, length * 0.25));
    }

    fromX -= edgeDir.x * fromExtend;
    fromY -= edgeDir.y * fromExtend;
    toX += edgeDir.x * toExtend;
    toY += edgeDir.y * toExtend;

    quads.push([
      { x: fromX, y: fromY },
      { x: toX, y: toY },
      {
        x: toX,
        y: toY - fillDepth,
      },
      {
        x: fromX,
        y: fromY - fillDepth,
      },
    ]);
  }

  return quads;
}

function signedArea(vertices: WorldPoint[]) {
  let area = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]!;
    const next = vertices[(index + 1) % vertices.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function isConvex(
  previous: WorldPoint,
  current: WorldPoint,
  next: WorldPoint,
  isClockwise: boolean,
) {
  const cross =
    (current.x - previous.x) * (next.y - current.y) -
    (current.y - previous.y) * (next.x - current.x);
  return isClockwise ? cross < 0 : cross > 0;
}

function isPointInTriangle(
  point: WorldPoint,
  a: WorldPoint,
  b: WorldPoint,
  c: WorldPoint,
) {
  const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denominator) < 0.000001) return false;

  const alpha =
    ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) /
    denominator;
  const beta =
    ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) /
    denominator;
  const gamma = 1 - alpha - beta;

  return alpha >= 0 && beta >= 0 && gamma >= 0;
}

function hexToRgb(color: string): [number, number, number] {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (!match) return [0, 0, 0];
  return [
    Number.parseInt(match[1]!, 16) / 255,
    Number.parseInt(match[2]!, 16) / 255,
    Number.parseInt(match[3]!, 16) / 255,
  ];
}
