import { ObjectType } from "~/editor/elma-types";
import { defaultBikeCoords } from "~/editor/kuski-geometry";
import type {
  RectoolsScenery,
  WorldRenderBikeItem,
  WorldRenderDrawItem,
  WorldRenderScene,
  WorldRenderStartItem,
} from "./world-scene";

type RectoolsRenderer = {
  resize(width: number, height: number): void;
  set_lgr(bytes: Uint8Array): void;
  set_scenery(json: string): void;
  set_objects(objects: Float64Array): void;
  draw(
    x: number,
    y: number,
    pixelsPerMeter: number,
    timeMs: number,
    animatedObjects: boolean,
    zoomTextures: boolean,
    bikes: Float64Array,
  ): boolean;
  free(): void;
};

type RectoolsModule = {
  default(): Promise<unknown>;
  BearRenderer: {
    create(canvas: HTMLCanvasElement): Promise<RectoolsRenderer>;
  };
};

export type WorldBridge = {
  draw(
    scene: WorldRenderScene,
    bytes: ArrayBuffer,
    dpr: number,
  ): WorldRenderDrawItem[] | null;
  destroy(): void;
};

let initializedModule: Promise<RectoolsModule> | undefined;

async function loadRectools() {
  const modules = import.meta.glob<RectoolsModule>(
    "../../../experiments/rectools/pkg/bear_rectools.js",
  );
  const load = Object.values(modules)[0];
  if (!load) {
    throw new Error(
      "Build the rectools module with experiments/rectools/build.sh.",
    );
  }
  const start = performance.now();
  const wasm = await load();
  await wasm.default();
  performance.measure("Rectools module initialization", { start });
  return wasm;
}

export async function createWorldBridge(
  canvas: HTMLCanvasElement,
): Promise<WorldBridge> {
  const licenses = import.meta.glob<string>(
    "../../../experiments/rectools/pkg/rectools-LICENSE.txt",
    { eager: true, import: "default", query: "?url&no-inline" },
  );
  const license = Object.values(licenses)[0];
  if (license) canvas.dataset.rectoolsLicense = license;
  const wasm = await (initializedModule ??= loadRectools());
  const start = performance.now();
  const renderer = await wasm.BearRenderer.create(canvas);
  performance.measure("Rectools WebGL initialization", { start });
  let previousBytes: ArrayBuffer | null = null;
  let previousScenery = "";
  let previousPolygons: RectoolsScenery["polygons"] | undefined;
  let previousPictures: RectoolsScenery["pictures"] | undefined;
  let previousSceneryOptions = "";
  let previousObjects: number[] = [];
  let bikeData = new Float64Array(14);

  return {
    draw(scene, bytes, dpr) {
      if (!scene.rectoolsScenery) return null;
      if (bytes !== previousBytes) {
        renderer.set_lgr(new Uint8Array(bytes));
        previousBytes = bytes;
        previousScenery = "";
      }
      const { viewport, visibility } = scene;
      const width = Math.max(1, Math.round(viewport.width * dpr));
      const height = Math.max(1, Math.round(viewport.height * dpr));
      if (width !== canvas.width || height !== canvas.height) {
        canvas.width = width;
        canvas.height = height;
        renderer.resize(width, height);
      }

      const { polygons, pictures } = scene.rectoolsScenery;
      const sceneryOptions = JSON.stringify([
        scene.ground,
        scene.sky,
        visibility.useGroundSkyTextures,
        visibility.useGrassTextures,
        visibility.showTextures,
        visibility.showPictures,
      ]);
      if (
        !previousScenery ||
        polygons !== previousPolygons ||
        pictures !== previousPictures ||
        sceneryOptions !== previousSceneryOptions
      ) {
        const scenery = encodeScenery(scene, scene.rectoolsScenery);
        if (scenery !== previousScenery) renderer.set_scenery(scenery);
        previousScenery = scenery;
        previousPolygons = polygons;
        previousPictures = pictures;
        previousSceneryOptions = sceneryOptions;
      }

      const objects: number[] = [];
      const editorItems: WorldRenderDrawItem[] = [];
      let bikeCount = 0;
      for (const item of scene.drawItems) {
        if (
          (item.opacity ?? 1) < 1 ||
          (item.type === "picture" && item.draft) ||
          ((item.type === "bike" || item.type === "start") &&
            item.color &&
            item.color !== "#ffffff")
        ) {
          editorItems.push(item);
        } else if (
          item.type === "object" &&
          (visibility.showObjects || item.forceVisible)
        ) {
          objects.push(
            item.position.x,
            item.position.y,
            objectKind[item.objectKind],
            Math.max(0, (item.animation ?? 1) - 1),
            item.gravity ?? 0,
          );
        } else if (
          (item.type === "bike" && item.forceVisible) ||
          ((item.type === "bike" || item.type === "start") &&
            visibility.showObjects)
        ) {
          if ((bikeCount + 1) * 14 > bikeData.length) {
            const grown = new Float64Array(bikeData.length * 2);
            grown.set(bikeData);
            bikeData = grown;
          }
          writeBike(bikeData, bikeCount++, item);
        }
      }
      if (
        objects.length !== previousObjects.length ||
        objects.some((value, index) => value !== previousObjects[index])
      ) {
        renderer.set_objects(new Float64Array(objects));
        previousObjects = objects;
      }
      const drewFrame = renderer.draw(
        viewport.center.x,
        viewport.center.y,
        viewport.zoom * dpr,
        scene.animationTime ?? performance.now(),
        scene.animateSprites && visibility.showObjectAnimations,
        visibility.zoomTextures,
        bikeData.subarray(0, bikeCount * 14),
      );
      return drewFrame ? editorItems : null;
    },
    destroy() {
      renderer.free();
      canvas
        .getContext("webgl2")
        ?.getExtension("WEBGL_lose_context")
        ?.loseContext();
    },
  };
}

const objectKind = {
  apple: ObjectType.Apple,
  food: ObjectType.Apple,
  flower: ObjectType.Exit,
  exit: ObjectType.Exit,
  killer: ObjectType.Killer,
};

function encodeScenery(scene: WorldRenderScene, scenery: RectoolsScenery) {
  const { visibility } = scene;
  return JSON.stringify({
    ground: scene.ground,
    sky: scene.sky,
    textured: visibility.useGroundSkyTextures,
    grass: visibility.useGrassTextures,
    polygons: scenery.polygons
      .filter(
        (polygon) =>
          (polygon.opacity ?? 1) >= 1 && polygon.vertices.length >= 3,
      )
      .map((polygon) => ({
        grass: polygon.isGrass ?? polygon.grass ?? false,
        vertices: polygon.vertices.map(({ x, y }) => [x, y]),
      })),
    pictures: scenery.pictures
      .filter((picture) =>
        picture.texture && picture.mask
          ? visibility.showTextures
          : visibility.showPictures,
      )
      .map((picture) => ({
        name: picture.name ?? "",
        texture: picture.texture ?? "",
        mask: picture.mask ?? "",
        position: [picture.position.x, picture.position.y],
        distance: Math.trunc(picture.distance),
        clip: picture.clip,
      })),
  });
}

function writeBike(
  buffer: Float64Array,
  index: number,
  item: WorldRenderBikeItem | WorldRenderStartItem,
) {
  const coords = item.type === "bike" ? item.coords : defaultBikeCoords;
  const start = item.type === "bike" ? item.start : item.position;
  const x = start.x - coords.leftX / 1000;
  const y = start.y + coords.leftY / 1000;
  const tau = 2 * Math.PI;
  buffer.set(
    [
      x,
      y,
      (coords.bikeR * tau) / 10000,
      start.x,
      start.y,
      (coords.leftR * tau) / 250,
      x + coords.rightX / 1000,
      y - coords.rightY / 1000,
      (coords.rightR * tau) / 250,
      x + coords.headX / 1000,
      y - coords.headY / 1000,
      coords.turn,
      coords.turnProgress,
      coords.voltDirection
        ? (coords.voltDirection === "right" ? 1 : -1) *
          (1 - coords.voltProgress)
        : 0,
    ],
    index * 14,
  );
}
