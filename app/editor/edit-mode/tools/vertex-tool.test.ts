import { describe, expect, it } from "vitest";
import type { EditorState } from "~/editor/editor-state";
import type { EditorStore } from "~/editor/editor-store";
import type { Polygon, Position } from "~/editor/elma-types";
import { defaultAutoGrassOptions } from "~/editor/helpers/auto-grass";
import { ELMA_PIXEL_SCALE } from "~/editor/constants";
import {
  VertexTool,
  type VertexToolState,
  type VertexToolVariant,
} from "./vertex-tool";

function position(x: number, y: number): Position {
  return { x, y } as Position;
}

function polygon(vertices: Position[], grass = false): Polygon {
  return { vertices, grass } as Polygon;
}

function createVertexTool({
  polygons,
  mousePosition,
  toolState,
  mouseOnCanvas = true,
}: {
  polygons: Polygon[];
  mousePosition: Position;
  toolState: VertexToolState;
  mouseOnCanvas?: boolean;
}) {
  const state = {
    polygons,
    mousePosition,
    mouseOnCanvas,
    zoom: 1,
    vertexEdgeClickBehavior: "default",
    autoGrassOptions: { ...defaultAutoGrassOptions, endInset: 0 },
    actions: {
      getToolState: (toolId: string) =>
        toolId === "vertex" ? toolState : undefined,
      setToolState: (_toolId: string, patch: Partial<VertexToolState>) => {
        toolState = { ...toolState, ...patch };
      },
      setAutoGrassOptions: (patch: Partial<typeof defaultAutoGrassOptions>) => {
        Object.assign(state.autoGrassOptions, patch);
      },
    },
  } as EditorState;

  const store = { getState: () => state } as EditorStore;
  return Object.assign(new VertexTool(store), {
    getToolState: () => toolState,
    getAutoGrassOptions: () => state.autoGrassOptions,
    setToolState: (patch: Partial<VertexToolState>) =>
      state.actions.setToolState("vertex", patch),
  });
}

describe("VertexTool", () => {
  it.each([
    { key: "+", field: "depth", delta: 1 },
    { key: "=", field: "depth", delta: 1 },
    { key: "-", field: "depth", delta: -1 },
    { key: "[", field: "endInset", delta: -1 },
    { key: "]", field: "endInset", delta: 1 },
    { key: "[", field: "endInset", delta: -1, altKey: true },
    { key: "]", field: "endInset", delta: 1, altKey: true },
    { key: "[", field: "endInset", delta: -1, altKey: true, ctrlKey: true },
    { key: "]", field: "endInset", delta: 1, altKey: true, ctrlKey: true },
  ] as const)(
    "adjusts AutoGrass from keyboard input $key (Alt: $altKey, Ctrl: $ctrlKey)",
    (input) => {
      const tool = createVertexTool({
        polygons: [],
        mousePosition: position(0, 0),
        toolState: { variant: "autoGrass", drawingPolygon: polygon([]) },
      });
      tool.getAutoGrassOptions().endInset = defaultAutoGrassOptions.endInset;
      const before = tool.getAutoGrassOptions()[input.field];
      let prevented = false;
      const event = {
        ...input,
        getModifierState: (modifier: string) =>
          modifier === "AltGraph" && "ctrlKey" in input,
        preventDefault: () => {
          prevented = true;
        },
      } as unknown as KeyboardEvent;

      expect(
        tool.onKeyDown(event, {} as Parameters<VertexTool["onKeyDown"]>[1]),
      ).toBe(true);
      expect(tool.getAutoGrassOptions()[input.field]).toBeCloseTo(
        before + input.delta * ELMA_PIXEL_SCALE,
      );
      expect(prevented).toBe(true);
    },
  );

  it.each(["normal", "grass", "both", "pipe"] as const)(
    "prioritizes AutoGrass shortcuts over %s while previewing all polygons",
    (variant) => {
      const tool = createVertexTool({
        polygons: [],
        mousePosition: position(0, 0),
        toolState: {
          variant,
          previewAutoGrassAll: true,
          drawingPolygon: polygon([]),
          pipeWidthPx: 30,
          pipeAppleMode: "distance",
          pipeAppleDistance: 2,
        },
      });
      tool.getAutoGrassOptions().endInset = defaultAutoGrassOptions.endInset;
      for (const [key, field, delta] of [
        ["+", "depth", 1],
        ["=", "depth", 1],
        ["-", "depth", -1],
        ["_", "depth", -1],
        ["[", "endInset", -1],
        ["]", "endInset", 1],
      ] as const) {
        const before = tool.getAutoGrassOptions()[field];
        expect(
          tool.onKeyDown(
            { key, preventDefault() {} } as KeyboardEvent,
            {} as Parameters<VertexTool["onKeyDown"]>[1],
          ),
        ).toBe(true);
        expect(tool.getAutoGrassOptions()[field]).toBeCloseTo(
          before + delta * ELMA_PIXEL_SCALE,
        );
        expect(tool.getToolState()).toMatchObject({
          variant,
          pipeWidthPx: 30,
          pipeAppleDistance: 2,
        });
      }

      // Leaving the preview restores the selected tool's shortcuts.
      tool.setToolState({ previewAutoGrassAll: false });
      const options = { ...tool.getAutoGrassOptions() };
      for (const key of ["+", "]"]) {
        tool.onKeyDown(
          { key, preventDefault() {} } as KeyboardEvent,
          {} as Parameters<VertexTool["onKeyDown"]>[1],
        );
      }
      expect(tool.getAutoGrassOptions()).toEqual(options);
      if (variant === "pipe") {
        expect(tool.getToolState()).toMatchObject({
          pipeWidthPx: 31,
          pipeAppleDistance: 2.25,
        });
      }
    },
  );

  it.each([
    { key: "+", metaKey: true },
    { key: "-", ctrlKey: true },
    { key: "[", ctrlKey: true },
    { key: "]", metaKey: true },
  ])("preserves command shortcuts for $key", (input) => {
    const tool = createVertexTool({
      polygons: [],
      mousePosition: position(0, 0),
      toolState: { variant: "autoGrass", drawingPolygon: polygon([]) },
    });
    const before = { ...tool.getAutoGrassOptions() };
    const event = {
      ...input,
      getModifierState: () => false,
    } as unknown as KeyboardEvent;
    expect(
      tool.onKeyDown(event, {} as Parameters<VertexTool["onKeyDown"]>[1]),
    ).toBe(false);
    expect(tool.getAutoGrassOptions()).toEqual(before);
  });

  it.each([
    ["V", false, "normal", false],
    ["G", true, "grass", true],
  ] as const)(
    "leaves AutoGrass for %s even when the drawing grass flag already matches",
    (key, initialGrass, expectedVariant, expectedGrass) => {
      const tool = createVertexTool({
        polygons: [],
        mousePosition: position(0, 0),
        toolState: {
          variant: "autoGrass",
          drawingPolygon: polygon([], initialGrass),
        },
      });

      expect(
        tool.onKeyDown(
          { key } as KeyboardEvent,
          {} as Parameters<VertexTool["onKeyDown"]>[1],
        ),
      ).toBe(true);
      expect(tool.getToolState()).toMatchObject({
        variant: expectedVariant,
        drawingPolygon: { grass: expectedGrass },
      });
    },
  );

  it.each([2, 3, 4])(
    "reverses a new %i-point drawing on every Space press",
    (count) => {
      const vertices = Array.from({ length: count }, (_, index) =>
        position(index * 10, 0),
      );
      const tool = createVertexTool({
        polygons: [],
        mousePosition: position(50, 50),
        toolState: {
          drawingPolygon: polygon([]),
        },
      });
      const context = { worldPos: vertices[0] } as Parameters<
        VertexTool["onPointerDown"]
      >[1];
      for (const vertex of vertices) {
        tool.onPointerDown({} as PointerEvent, {
          ...context,
          worldPos: vertex,
        });
      }

      const viewportRect = { minX: -100, minY: -100, maxX: 100, maxY: 100 };
      for (let press = 1; press <= 4; press++) {
        tool.onKeyDown({ key: " " } as KeyboardEvent, context);
        const expected = press % 2 === 1 ? [...vertices].reverse() : vertices;
        const overlays = tool.getWorldOverlays({ viewportRect });
        expect(overlays.find((item) => item.type === "polyline")).toMatchObject(
          {
            points: expected,
          },
        );
        expect(overlays.find((item) => item.type === "line")).toMatchObject({
          from: expected.at(-1),
        });
      }
    },
  );

  it("keeps the active pivot when repeatedly reversing an existing polygon", () => {
    const vertices = [position(0, 0), position(10, 0), position(10, 10)];
    const original = polygon(vertices);
    const tool = createVertexTool({
      polygons: [original],
      mousePosition: position(50, 50),
      toolState: {
        drawingPolygon: polygon([...vertices]),
        editingPolygon: original,
        editPivot: vertices[0],
      },
    });
    const context = {} as Parameters<VertexTool["onKeyDown"]>[1];
    const viewportRect = { minX: -100, minY: -100, maxX: 100, maxY: 100 };
    for (let press = 1; press <= 4; press++) {
      tool.onKeyDown({ key: " " } as KeyboardEvent, context);
      const overlays = tool.getWorldOverlays({ viewportRect });
      expect(overlays.find((item) => item.type === "polyline")).toMatchObject({
        points:
          press % 2 === 1 ? [vertices[0], vertices[2], vertices[1]] : vertices,
      });
      expect(overlays.find((item) => item.type === "line")).toMatchObject({
        from: vertices[0],
      });
    }
  });

  it("previews generated grass while hovering a grassable polygon in auto-grass mode", () => {
    const ground = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 2),
      position(0, 2),
    ]);
    const tool = createVertexTool({
      polygons: [ground],
      mousePosition: position(5, 2),
      toolState: {
        drawingPolygon: { vertices: [], grass: false },
        variant: "autoGrass",
      },
    });

    expect(tool.getDrafts().polygons).toMatchObject([{ grass: true }]);
  });

  it("does not preview grass before the pointer is on a grassable polygon edge", () => {
    const ground = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 2),
      position(0, 2),
    ]);
    const tool = createVertexTool({
      polygons: [ground],
      mousePosition: position(50, 50),
      toolState: {
        drawingPolygon: { vertices: [], grass: false },
        variant: "autoGrass",
      },
    });

    expect(tool.getDrafts().polygons).toEqual([]);
  });

  it.each<VertexToolVariant>(["normal", "grass", "both", "autoGrass", "pipe"])(
    "prioritizes the All hover preview over %s drafts and restores them on leave",
    (variant) => {
      const ground = polygon([
        position(0, 0),
        position(10, 0),
        position(10, 2),
        position(0, 2),
      ]);
      const drawingPolygon = polygon([position(20, 0), position(30, 0)]);
      const tool = createVertexTool({
        polygons: [ground],
        mousePosition: position(50, 50),
        mouseOnCanvas: false,
        toolState: { variant, drawingPolygon },
      });
      const before = tool.getDrafts();

      tool.setToolState({ previewAutoGrassAll: true });
      expect(tool.getDrafts().polygons).toMatchObject([{ grass: true }]);
      expect(tool.getDrafts().apples).toBeUndefined();
      expect(tool.getToolState().drawingPolygon).toBe(drawingPolygon);
      expect(tool.getToolState().variant).toBe(variant);

      tool.setToolState({ previewAutoGrassAll: false });
      expect(tool.getDrafts()).toEqual(before);
    },
  );

  it("previews the whole level off canvas while hovering All and updates with shortcuts", () => {
    const grounds = [0, 20].map((x) =>
      polygon([
        position(x, 0),
        position(x + 10, 0),
        position(x + 10, 2),
        position(x, 2),
      ]),
    );
    const tool = createVertexTool({
      polygons: [...grounds, polygon(grounds[0].vertices, true)],
      mousePosition: position(50, 50),
      mouseOnCanvas: false,
      toolState: {
        drawingPolygon: polygon([]),
        variant: "normal",
        previewAutoGrassAll: true,
      },
    });
    const before = tool.getDrafts().polygons;
    expect(before).toHaveLength(2);
    expect(before.every((draft) => draft.grass)).toBe(true);

    for (const key of ["+", "]"]) {
      expect(
        tool.onKeyDown(
          { key, preventDefault() {} } as KeyboardEvent,
          {} as Parameters<VertexTool["onKeyDown"]>[1],
        ),
      ).toBe(true);
    }
    expect(tool.getDrafts().polygons).not.toEqual(before);
    expect(tool.getToolState().variant).toBe("normal");

    tool.clear();
    expect(tool.getDrafts().polygons).toEqual([]);
    expect(tool.getToolState().previewAutoGrassAll).toBe(false);
  });
});
