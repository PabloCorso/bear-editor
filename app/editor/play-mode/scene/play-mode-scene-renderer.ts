import type { LgrAssets } from "~/components/lgr-assets";
import { colors, OBJECT_FRAME_PX } from "~/editor/constants";
import type { EditorState } from "~/editor/editor-state";
import { Clip } from "~/editor/elma-types";
import type { GameState } from "~/editor/play-mode/engine/game/game-loop";
import {
  PLAY_MODE_PIXELS_PER_METER,
  type PlaySettings,
} from "~/editor/play-mode/play-settings";
import { composePlayGrass } from "~/editor/render/grass-renderer";
import { WebGLRenderContext } from "~/editor/render/webgl-render-context";
import { WebGLShapeDrawer } from "~/editor/render/webgl-shape-drawer";
import { WebGLWorldItemDrawer } from "~/editor/render/webgl-world-item-drawer";
import { DEFAULT_OBJECT_RENDER_DISTANCE } from "~/editor/render/render-constants";
import { isPointVisible } from "~/editor/render/world-derived-data-cache";
import { rectsIntersect, type WorldRect } from "~/editor/render/world-geometry";
import type { WorldPoint, WorldRenderScene } from "~/editor/render/world-scene";
import { testStartGhostOpacity } from "~/editor/test-starts";
import { buildBikeSceneItem, buildRideMomentBikeSceneItem } from "./live-bike";
import {
  getPlayfield,
  getPlayObjects,
  GRASS_DISTANCE,
  snapCanvasOrigin,
} from "./play-mode-scene";

const PPM = PLAY_MODE_PIXELS_PER_METER;

// The sprite drawer also serves the editor. Play mode owns its own draw order and
// never reads the editor's visibility preferences.
const playVisibility: WorldRenderScene["visibility"] = {
  useGroundSkyTextures: true,
  useGrassTextures: true,
  zoomTextures: true,
  showObjectAnimations: true,
  showObjects: true,
  showPictures: true,
  showTextures: true,
  showPolygons: true,
  showGroundBounds: false,
  showGrassBounds: false,
};

export class PlayModeSceneRenderer {
  private context: WebGLRenderContext;
  private items: WebGLWorldItemDrawer;
  private shapes: WebGLShapeDrawer;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private polygons: GameState["level"]["polygons"] | undefined;
  private sprites: GameState["level"]["sprites"] | undefined;
  private assetsReady = false;
  private playfield: ReturnType<typeof getPlayfield> | undefined;
  private stencil:
    | ReturnType<WebGLRenderContext["createStaticVertices"]>
    | undefined;
  private grass:
    | Array<{
        canvas: HTMLCanvasElement;
        bounds: WorldRect;
      }>
    | undefined;
  private objects: GameState["level"]["objects"] | undefined;
  private pictureLayout:
    | {
        ppm: number;
        back: ReturnType<typeof placePictures>;
        front: ReturnType<typeof placePictures>;
      }
    | undefined;
  private objectItems: ReturnType<typeof getPlayObjects> = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private assets: LgrAssets,
  ) {
    this.context = new WebGLRenderContext(canvas, { antialias: false });
    this.items = new WebGLWorldItemDrawer(this.context, assets);
    this.shapes = new WebGLShapeDrawer(this.context);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.width = Math.max(1, Math.round(rect.width * this.dpr)) / this.dpr;
    this.height = Math.max(1, Math.round(rect.height * this.dpr)) / this.dpr;
    this.context.resize({
      width: this.width,
      height: this.height,
      devicePixelRatio: this.dpr,
    });
  }

  destroy() {
    this.stencil?.destroy();
    this.context.destroy();
  }

  render(
    state: GameState,
    settings: PlaySettings,
    starts: Pick<EditorState, "start" | "testStarts">,
  ) {
    if (this.width <= 0 || this.height <= 0) return;
    const { level, camera } = state;
    if (
      this.polygons !== level.polygons ||
      this.sprites !== level.sprites ||
      this.assetsReady !== this.assets.isReady() ||
      !this.playfield
    ) {
      this.stencil?.destroy();
      for (const chunk of this.grass ?? [])
        this.context.releaseTexture(chunk.canvas);
      this.polygons = level.polygons;
      this.sprites = level.sprites;
      this.assetsReady = this.assets.isReady();
      this.playfield = getPlayfield(level, this.assets);
      this.stencil = this.context.createStaticVertices(
        this.playfield.polygonFans,
      );
      this.grass = undefined;
      this.pictureLayout = undefined;
    }

    const ppm = PPM * camera.zoom;
    const origin = snapCanvasOrigin(this.playfield.canvasCorner, ppm);
    // Elma samples each world pixel from a level-relative grid. On HiDPI screens
    // keep that grid in CSS pixels so zoom and parallax have the same scale.
    const left = Math.floor(
      (camera.x - this.width / (2 * ppm) - origin.x) * ppm,
    );
    const bottom = Math.floor(
      (origin.y + camera.y - this.height / (2 * ppm)) * ppm,
    );
    const minX = origin.x + left / ppm;
    const maxY = origin.y - bottom / ppm;
    const rect: WorldRect = {
      minX,
      maxY,
      minY: maxY - this.height / ppm,
      maxX: minX + this.width / ppm,
    };
    const scene: WorldRenderScene = {
      clearColor: colors.ground,
      ground: level.foregroundName,
      sky: level.backgroundName,
      animateSprites: true,
      viewport: {
        width: this.width,
        height: this.height,
        center: {
          x: (rect.minX + rect.maxX) / 2,
          y: (rect.minY + rect.maxY) / 2,
        },
        rect,
        zoom: ppm,
      },
      visibility: playVisibility,
      polygons: [],
      drawItems: [],
    };

    const gl = this.context.gl;
    this.context.clear(scene.clearColor);
    gl.enable(gl.STENCIL_TEST);
    gl.colorMask(false, false, false, false);
    gl.stencilMask(1);
    gl.stencilFunc(gl.ALWAYS, 0, 1);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
    this.stencil?.draw(scene);
    gl.colorMask(true, true, true, true);
    gl.stencilMask(0);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);

    gl.stencilFunc(gl.EQUAL, 0, 1);
    this.drawFill(scene, scene.ground, "ground", origin);
    gl.stencilFunc(gl.EQUAL, 1, 1);
    // Sky follows half of horizontal camera movement and uses the screen's rows.
    this.drawFill(scene, scene.sky, "sky", {
      x: minX - Math.trunc(left / 2) / ppm,
      y: maxY,
    });
    gl.disable(gl.STENCIL_TEST);

    if (settings.videoDetail === "high") {
      if (this.pictureLayout?.ppm !== ppm) {
        this.pictureLayout = {
          ppm,
          back: placePictures(this.playfield.backPictures, ppm, origin),
          front: placePictures(this.playfield.frontPictures, ppm, origin),
        };
      }
      if (this.assetsReady) {
        this.grass ??= composePlayGrass(
          this.assets,
          this.playfield.grassPolygons,
          snapCanvasOrigin(this.playfield.canvasCorner, PPM),
        ).map(({ canvas, minXPx, minYPx }) => ({
          canvas,
          bounds: {
            minX: minXPx / PPM,
            maxX: (minXPx + canvas.width) / PPM,
            minY: minYPx / PPM,
            maxY: (minYPx + canvas.height) / PPM,
          },
        }));
      }
      let grassDrawn = false;
      for (const picture of this.pictureLayout.back) {
        if (
          !grassDrawn &&
          (picture.item.distance < GRASS_DISTANCE ||
            (picture.item.distance === GRASS_DISTANCE &&
              picture.item.clip === Clip.Ground))
        ) {
          this.drawGrass(scene);
          grassDrawn = true;
        }
        this.drawPicture(picture, scene);
      }
      if (!grassDrawn) this.drawGrass(scene);
      if (settings.picturesInBackground) {
        for (const picture of this.pictureLayout.front) {
          this.drawPicture(picture, scene);
        }
      }
    }
    this.drawObjects(state, scene, origin, settings);
    const active = starts.testStarts.items.find(
      (item) => item.id === starts.testStarts.activeId,
    );
    for (const item of starts.testStarts.items) {
      if (item.ride) {
        this.items.drawBike(
          {
            ...buildRideMomentBikeSceneItem(item.ride),
            color: item.color,
            opacity: testStartGhostOpacity.play,
          },
          scene,
        );
      } else {
        this.items.drawStart(
          {
            type: "start",
            position: item.position,
            color: item.color,
            opacity: testStartGhostOpacity.play,
            distance: DEFAULT_OBJECT_RENDER_DISTANCE,
            clip: Clip.Unclipped,
          },
          scene,
          false,
        );
      }
    }
    if (active) {
      this.items.drawStart(
        {
          type: "start",
          position: starts.start,
          color: starts.testStarts.levelColor,
          opacity: testStartGhostOpacity.play,
          distance: DEFAULT_OBJECT_RENDER_DISTANCE,
          clip: Clip.Unclipped,
        },
        scene,
        false,
      );
    }
    this.items.drawBike(
      {
        ...buildBikeSceneItem(state),
        color: active?.color ?? starts.testStarts.levelColor,
      },
      scene,
    );

    if (
      settings.videoDetail === "high" &&
      !settings.picturesInBackground &&
      this.pictureLayout
    ) {
      for (const picture of this.pictureLayout.front)
        this.drawPicture(picture, scene);
    }
  }

  private drawFill(
    scene: WorldRenderScene,
    name: string,
    fallback: "ground" | "sky",
    origin: WorldPoint,
  ) {
    const sprite =
      this.assets.getSprite(name) ?? this.assets.getSprite(fallback);
    const rect = scene.viewport.rect;
    if (!sprite) {
      this.shapes.drawRect(
        rect.minX,
        rect.minY,
        rect.maxX - rect.minX,
        rect.maxY - rect.minY,
        colors[fallback],
        scene,
      );
      return;
    }
    const { tileWidth, tileHeight, repeatTileSize } = getTextureTile(
      sprite,
      scene.viewport.zoom,
      origin,
    );
    this.drawQuad(
      scene,
      rect,
      sprite,
      {
        minX: (rect.minX - origin.x) / tileWidth,
        maxX: (rect.maxX - origin.x) / tileWidth,
        minY: (rect.minY - origin.y) / tileHeight,
        maxY: (rect.maxY - origin.y) / tileHeight,
      },
      repeatTileSize,
    );
  }

  private drawGrass(scene: WorldRenderScene) {
    const gl = this.context.gl;
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, 0, 1);
    for (const { bounds, canvas } of this.grass ?? []) {
      if (rectsIntersect(bounds, scene.viewport.rect)) {
        this.drawQuad(scene, bounds, canvas);
      }
    }
    gl.disable(gl.STENCIL_TEST);
  }

  private drawQuad(
    scene: WorldRenderScene,
    rect: WorldRect,
    sprite: ImageBitmap | HTMLCanvasElement,
    uv?: WorldRect,
    repeatTileSize?: [number, number],
  ) {
    const { minX: x, minY: y, maxX, maxY } = rect;
    const {
      minX: u,
      minY: v,
      maxX: u1,
      maxY: v1,
    } = uv ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    this.context.drawVertices({
      vertices: [
        x,
        y,
        u,
        v,
        maxX,
        y,
        u1,
        v,
        x,
        maxY,
        u,
        v1,
        x,
        maxY,
        u,
        v1,
        maxX,
        y,
        u1,
        v,
        maxX,
        maxY,
        u1,
        v1,
      ],
      color: [1, 1, 1, 1],
      texture: this.context.getTexture(sprite, { immutable: true }),
      repeatTexture: !!uv,
      repeatTileSize,
      scene,
    });
  }

  private drawPicture(
    { item, bounds, placement }: ReturnType<typeof placePictures>[number],
    scene: WorldRenderScene,
  ) {
    if (!rectsIntersect(bounds, scene.viewport.rect)) return;
    const gl = this.context.gl;
    if (item.clip !== Clip.Unclipped) {
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.EQUAL, item.clip === Clip.Sky ? 1 : 0, 1);
    }
    this.items.drawPicture(item, scene, undefined, false, placement);
    gl.disable(gl.STENCIL_TEST);
  }

  private drawObjects(
    state: GameState,
    scene: WorldRenderScene,
    origin: WorldPoint,
    { animatedObjects, stillObjects, gravityArrows }: PlaySettings,
  ) {
    if (this.objects !== state.level.objects) {
      this.objects = state.level.objects;
      this.objectItems = getPlayObjects(this.objects);
    }
    const ppm = scene.viewport.zoom;
    const zoom = ppm / PPM;
    const targetSize = Math.max(1, Math.floor(OBJECT_FRAME_PX * zoom)) / ppm;
    const half = (OBJECT_FRAME_PX * zoom) / 2;
    const frame = animatedObjects ? Math.floor(state.gameTime / 0.014) : 0;
    for (const { object, item } of this.objectItems) {
      if (!object.active || !isPointVisible(item.position, scene.viewport.rect))
        continue;
      const bob =
        !animatedObjects || stillObjects || object.type === "killer"
          ? 0
          : Math.trunc(
              5 * zoom * Math.sin(state.gameTime * 15.5 + object.floatingPhase),
            );
      const left = Math.trunc((item.position.x - origin.x) * ppm - half);
      const bottom =
        Math.trunc((origin.y - item.position.y) * ppm - half) + bob;
      this.items.drawObject(
        {
          ...item,
          gravity: gravityArrows ? item.gravity : undefined,
          position: {
            x: origin.x + left / ppm + targetSize / 2,
            y: origin.y - bottom / ppm - targetSize / 2,
          },
        },
        scene,
        false,
        (sprite) => {
          const sourceWidth = Math.min(OBJECT_FRAME_PX, sprite.width);
          const frameCount = Math.max(
            1,
            Math.floor(sprite.width / sourceWidth),
          );
          return {
            sourceX: (frame % frameCount) * sourceWidth,
            sourceY: 0,
            sourceWidth,
            sourceHeight: Math.min(OBJECT_FRAME_PX, sprite.height),
            targetWidth: targetSize,
            targetHeight: targetSize,
          };
        },
      );
    }
  }
}

function placePictures(
  pictures: ReturnType<typeof getPlayfield>["backPictures"],
  ppm: number,
  origin: WorldPoint,
) {
  const zoom = ppm / PPM;
  const textureMapping = (sprite: ImageBitmap) =>
    getTextureTile(sprite, ppm, origin);
  return pictures.map(({ item, size }) => {
    const nativeHeight = Math.round(size.height * PPM);
    const pixelHeight = Math.max(1, Math.floor(nativeHeight * zoom));
    const height = pixelHeight / ppm;
    const width =
      Math.max(
        1,
        Math.floor((Math.round(size.width * PPM) * pixelHeight) / nativeHeight),
      ) / ppm;
    const x = origin.x + Math.trunc((item.position.x - origin.x) * ppm) / ppm;
    const y =
      origin.y - (Math.trunc((origin.y - item.position.y) * ppm) + 1) / ppm;
    return {
      item: { ...item, position: { x, y } },
      bounds: { minX: x, minY: y, maxX: x + width, maxY: y + height },
      placement: { width, height, textureMapping },
    };
  });
}

function getTextureTile(sprite: ImageBitmap, ppm: number, origin: WorldPoint) {
  const height = Math.max(1, Math.floor((sprite.height * ppm) / PPM));
  const width = Math.max(
    1,
    Math.floor((sprite.width * height) / sprite.height),
  );
  return {
    origin,
    tileWidth: width / ppm,
    tileHeight: height / ppm,
    repeatTileSize: [width, height] as [number, number],
  };
}
