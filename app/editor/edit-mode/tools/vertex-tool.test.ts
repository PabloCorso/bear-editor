import { describe, expect, it } from "vitest";
import type { EditorState } from "~/editor/editor-state";
import { createEditorStore, type EditorStore } from "~/editor/editor-store";
import type { Polygon, Position } from "~/editor/elma-types";
import { defaultAutoGrassOptions } from "~/editor/helpers/auto-grass";
import { createFramePolygons, FRAME_MODES } from "~/editor/helpers/frame";
import { ELMA_PIXEL_SCALE } from "~/editor/constants";
import { cutAndConnect } from "~/editor/helpers/cut-and-connect";
import { isWorldPointInGroundRegion } from "~/editor/helpers/polygon-helpers";
import { validateLevelTopology } from "~/editor/helpers/level-topology";
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

function rectangle(x: number, y: number, width: number, height: number) {
  return polygon([
    position(x, y),
    position(x + width, y),
    position(x + width, y + height),
    position(x, y + height),
  ]);
}

describe("Cut & Connect", () => {
  it.each([0, 1e-7])(
    "rejects a stroke that leaves polygon corners separated by %s",
    (gap) => {
      const polygons = [
        rectangle(0, 0, 4, 6),
        rectangle(8 + gap, 4 + gap, 4, 4),
      ];
      expect(
        validateLevelTopology({ polygons, flowers: [position(0, 0)] }).issues,
      ).toEqual([]);

      const result = cutAndConnect(polygons, position(2, 3), position(8, 3), 2);

      expect(result.polygons).toBe(polygons);
      expect(result.changedPolygons).toEqual([]);
      expect(result.error).toBeTruthy();
    },
  );

  it("allows a stroke whose corners stay outside the topology tolerance", () => {
    const polygons = [
      rectangle(0, 0, 4, 6),
      rectangle(8 + 3e-7, 4 + 3e-7, 4, 4),
    ];
    const result = cutAndConnect(polygons, position(2, 3), position(8, 3), 2);
    expect(result.polygons).not.toBe(polygons);
    expect(result.error).toBeUndefined();
    expect(
      validateLevelTopology({
        polygons: result.polygons,
        flowers: [position(0, 0)],
      }).issues,
    ).toEqual([]);
  });

  it("ignores grass and existing overlaps outside the stroke", () => {
    const grass = { ...rectangle(8, 4, 4, 4), grass: true };
    const polygons = [
      rectangle(0, 0, 4, 6),
      grass,
      rectangle(20, 20, 4, 4),
      rectangle(24, 24, 4, 4),
    ];
    const result = cutAndConnect(polygons, position(2, 3), position(8, 3), 2);
    expect(result.polygons).not.toBe(polygons);
    expect(result.polygons).toContain(grass);
    expect(result.error).toBeUndefined();
  });

  it("cuts a sky polygon in two when starting in ground", () => {
    const result = cutAndConnect(
      [rectangle(0, 0, 10, 10)],
      position(-2, 5),
      position(12, 5),
      2,
    );
    expect(result.polygons).toHaveLength(2);
    expect(isWorldPointInGroundRegion(position(5, 5), result.polygons)).toBe(
      true,
    );
    expect(isWorldPointInGroundRegion(position(5, 2), result.polygons)).toBe(
      false,
    );
    expect(
      validateLevelTopology({
        polygons: result.polygons,
        flowers: [position(0, 0)],
      }).issues,
    ).toEqual([]);
  });

  it("joins multiple sky polygons with a passage when starting in sky", () => {
    const result = cutAndConnect(
      [rectangle(0, 0, 4, 10), rectangle(8, 0, 4, 10), rectangle(16, 0, 4, 10)],
      position(2, 5),
      position(18, 5),
      2,
    );
    expect(result.polygons).toHaveLength(1);
    for (const x of [2, 6, 10, 14, 18]) {
      expect(isWorldPointInGroundRegion(position(x, 5), result.polygons)).toBe(
        false,
      );
    }
    expect(isWorldPointInGroundRegion(position(6, 2), result.polygons)).toBe(
      true,
    );
    expect(
      validateLevelTopology({
        polygons: result.polygons,
        flowers: [position(0, 0)],
      }).issues,
    ).toEqual([]);
  });

  it("splits nested ground islands and preserves grass and distant polygons", () => {
    const outer = rectangle(-5, -5, 40, 20);
    const grass = { ...rectangle(1, 1, 2, 2), grass: true };
    const distant = rectangle(60, 0, 5, 5);
    const result = cutAndConnect(
      [outer, rectangle(0, 0, 4, 10), rectangle(8, 0, 4, 10), grass, distant],
      position(-2, 5),
      position(14, 5),
      2,
    );
    expect(result.polygons).toContain(outer);
    expect(result.polygons).toContain(grass);
    expect(result.polygons).toContain(distant);
    expect(result.changedPolygons).toHaveLength(4);
    expect(isWorldPointInGroundRegion(position(2, 5), result.polygons)).toBe(
      false,
    );
    expect(isWorldPointInGroundRegion(position(2, 2), result.polygons)).toBe(
      true,
    );
    expect(
      validateLevelTopology({
        polygons: result.polygons,
        flowers: [position(0, 0)],
      }).issues,
    ).toEqual([]);
  });

  it("handles diagonal strokes and uses the requested width", () => {
    const original = [rectangle(0, 0, 10, 10)];
    const result = cutAndConnect(
      original,
      position(-2, -2),
      position(12, 12),
      2,
    );
    expect(isWorldPointInGroundRegion(position(5, 5), result.polygons)).toBe(
      true,
    );
    expect(isWorldPointInGroundRegion(position(5, 5.5), result.polygons)).toBe(
      true,
    );
    expect(isWorldPointInGroundRegion(position(5, 8), result.polygons)).toBe(
      false,
    );
    expect(
      validateLevelTopology({
        polygons: result.polygons,
        flowers: [position(0, 0)],
      }).issues,
    ).toEqual([]);
  });

  it("keeps strokes finite with square end caps", () => {
    const result = cutAndConnect(
      [rectangle(0, 0, 10, 10)],
      position(-2, 5),
      position(5, 5),
      2,
    );
    expect(isWorldPointInGroundRegion(position(4, 5), result.polygons)).toBe(
      true,
    );
    expect(isWorldPointInGroundRegion(position(6, 5), result.polygons)).toBe(
      false,
    );
    expect(
      validateLevelTopology({
        polygons: result.polygons,
        flowers: [position(0, 0)],
      }).issues,
    ).toEqual([]);
  });

  it.each([0, -1, NaN, Infinity])("ignores invalid width %s", (width) => {
    const polygons = [rectangle(0, 0, 10, 10)];
    expect(
      cutAndConnect(polygons, position(-2, 5), position(12, 5), width).polygons,
    ).toBe(polygons);
  });

  it("does not change geometry on zero-length or non-intersecting strokes", () => {
    const polygons = [rectangle(0, 0, 10, 10)];
    expect(
      cutAndConnect(polygons, position(-2, 5), position(-2, 5), 2).polygons,
    ).toBe(polygons);
    expect(
      cutAndConnect(polygons, position(20, 5), position(30, 5), 2).polygons,
    ).toBe(polygons);
    expect(
      cutAndConnect(polygons, position(2, 5), position(8, 5), 2).polygons,
    ).toBe(polygons);
  });

  it("preserves deliberate collinear vertices on untouched polygons", () => {
    const untouched = polygon([
      position(30, 0),
      position(35, 0),
      position(40, 0),
      position(40, 10),
      position(30, 10),
    ]);
    const polygons = [rectangle(0, 0, 10, 10), untouched];
    const result = cutAndConnect(polygons, position(-2, 5), position(12, 5), 2);
    expect(result.polygons).toContain(untouched);
    expect(untouched.vertices).toHaveLength(5);
    expect(
      cutAndConnect(polygons, position(20, 20), position(30, 20), 2).polygons,
    ).toBe(polygons);
  });

  it("keeps a third-level sky island when joining its surrounding ground", () => {
    const polygons = [
      rectangle(0, 0, 30, 30),
      rectangle(5, 5, 20, 20),
      rectangle(10, 10, 10, 10),
    ];
    const result = cutAndConnect(
      polygons,
      position(7, 15),
      position(23, 15),
      2,
    );
    expect(isWorldPointInGroundRegion(position(15, 15), result.polygons)).toBe(
      true,
    );
    expect(isWorldPointInGroundRegion(position(15, 12), result.polygons)).toBe(
      false,
    );
    expect(isWorldPointInGroundRegion(position(2, 15), result.polygons)).toBe(
      false,
    );
    expect(
      validateLevelTopology({
        polygons: result.polygons,
        flowers: [position(0, 0)],
      }).issues,
    ).toEqual([]);
  });

  function createCutTool() {
    const store = createEditorStore({ historyUpdateThrottle: 0 });
    const tool = new VertexTool(store);
    store.getState().actions.setPolygons([rectangle(0, 0, 10, 10)]);
    tool.onActivate("cutConnect");
    store.getState().actions.setToolState<VertexToolState>("vertex", {
      cutConnectWidthPx: 96,
    });
    store.getState().actions.setMouseOnCanvas(true);
    store.temporal.getState().clear();
    return { store, tool };
  }
  const context = (x: number, y: number) => ({
    worldPos: position(x, y),
    screenX: x * 10,
    screenY: y * 10,
  });
  const pointer = { pointerId: 1, type: "pointerup" } as PointerEvent;
  const key = (key: string) => ({ key, preventDefault() {} }) as KeyboardEvent;

  it("rejects an invalid preview and commit without changing history", () => {
    const { store, tool } = createCutTool();
    const polygons = [rectangle(0, 0, 4, 6), rectangle(8, 4, 4, 4)];
    store.getState().actions.setPolygons(polygons);
    store.temporal.getState().clear();
    tool.onPointerDown(pointer, context(2, 3));
    tool.onPointerUp(pointer, context(2, 3));
    store.getState().actions.setMousePosition(position(8, 3));
    expect(tool.getDrafts().replacementPolygons).toBe(polygons);

    tool.onPointerDown(pointer, context(8, 3));
    expect(store.getState().polygons).toBe(polygons);
    expect(store.temporal.getState().pastStates).toHaveLength(0);
    expect(tool.getDrafts().replacementPolygons).toBeUndefined();
    expect(
      store.getState().actions.getToolState<VertexToolState>("vertex")
        ?.cutConnectError,
    ).toBeTruthy();
  });

  it("previews without modifying the document, then commits two clicks in one undo step", () => {
    const { store, tool } = createCutTool();
    const before = store.getState().polygons;
    tool.onPointerDown(pointer, context(-2, 5));
    tool.onPointerUp(pointer, context(-2, 5));
    store.getState().actions.setMousePosition(position(12, 5));
    const preview = tool.getDrafts().replacementPolygons;
    expect(preview).toHaveLength(2);
    expect(store.getState().polygons).toBe(before);
    expect(store.temporal.getState().pastStates).toHaveLength(0);
    tool.onPointerDown(pointer, context(12, 5));
    const after = store.getState().polygons;
    expect(after).toBe(preview);
    expect(tool.getDrafts().replacementPolygons).toBeUndefined();
    expect(store.temporal.getState().pastStates).toHaveLength(1);
    store.temporal.getState().undo();
    expect(store.getState().polygons).toEqual(before);
    store.temporal.getState().redo();
    expect(store.getState().polygons).toEqual(after);
  });

  it("commits a drag at the release position even without a final mousemove", () => {
    const { store, tool } = createCutTool();
    tool.onPointerDown(pointer, context(-2, 5));
    tool.onPointerMove(pointer, context(5, 5));
    tool.onPointerUp(pointer, context(12, 5));
    expect(store.getState().polygons).toHaveLength(2);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
  });

  it.each(["escape", "right-click", "deactivate", "pointercancel"])(
    "cancels on %s without a document change",
    (method) => {
      const { store, tool } = createCutTool();
      const before = store.getState().polygons;
      tool.onPointerDown(pointer, context(-2, 5));
      store.getState().actions.setMousePosition(position(12, 5));
      if (method === "escape") tool.onKeyDown(key("Escape"), context(12, 5));
      if (method === "right-click")
        tool.onRightClick({} as MouseEvent, context(12, 5));
      if (method === "deactivate") tool.onDeactivate();
      if (method === "pointercancel")
        tool.onPointerUp(
          { ...pointer, type: "pointercancel" } as PointerEvent,
          context(12, 5),
        );
      expect(store.getState().polygons).toBe(before);
      expect(tool.getDrafts().replacementPolygons).toBeUndefined();
      expect(store.temporal.getState().pastStates).toHaveLength(0);
    },
  );

  it("updates the preview with +/- and preserves width for the next stroke", () => {
    const { store, tool } = createCutTool();
    tool.onPointerDown(pointer, context(-2, 5));
    store.getState().actions.setMousePosition(position(12, 5));
    const before = tool.getDrafts().replacementPolygons;
    tool.onKeyDown(key("+"), context(12, 5));
    expect(tool.getDrafts().replacementPolygons).not.toEqual(before);
    tool.clear();
    expect(
      store.getState().actions.getToolState<VertexToolState>("vertex")
        ?.cutConnectWidthPx,
    ).toBe(97);
  });
});

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

  it.each(["normal", "grass", "both", "pipe", "frame"] as const)(
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

  it.each<VertexToolVariant>([
    "normal",
    "grass",
    "both",
    "autoGrass",
    "pipe",
    "frame",
  ])(
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

describe("Frame tool", () => {
  const square = polygon([
    position(0, 0),
    position(10, 0),
    position(10, 10),
    position(0, 10),
  ]);

  it.each(FRAME_MODES)(
    "offsets %s by the total width for either winding",
    (mode) => {
      for (const source of [
        square,
        { ...square, vertices: [...square.vertices].reverse() },
      ]) {
        const result = createFramePolygons(source, 2, mode)!;
        const bounds = result.map((p) => [
          Math.min(...p.vertices.map((v) => v.x)),
          Math.max(...p.vertices.map((v) => v.x)),
        ]);
        expect(bounds).toEqual(
          mode === "inside"
            ? [
                [0, 10],
                [2, 8],
              ]
            : mode === "outside"
              ? [
                  [-2, 12],
                  [0, 10],
                ]
              : [
                  [-1, 11],
                  [1, 9],
                ],
        );
        if (mode !== "centered") expect(result).toContain(source);
      }
      expect(square.vertices[0]).toEqual(position(0, 0));
    },
  );

  it.each(FRAME_MODES)(
    "applies %s in one undoable click and keeps preview changes out of history",
    (mode) => {
      const store = createEditorStore({ historyUpdateThrottle: 0 });
      const tool = new VertexTool(store);
      store.getState().actions.setPolygons([square]);
      store.temporal.getState().clear();
      tool.onActivate("frame");
      store.getState().actions.setToolState<VertexToolState>("vertex", {
        frameMode: mode,
        frameWidthPx: 20,
      });
      tool.adjustFrameWidth(1);
      expect(store.temporal.getState().pastStates).toHaveLength(0);
      const expected = createFramePolygons(square, 21 * ELMA_PIXEL_SCALE, mode);
      tool.onPointerDown({ button: 0 } as PointerEvent, {
        worldPos: position(5, 5),
        screenX: 0,
        screenY: 0,
      });
      expect(store.getState().polygons).toEqual(expected);
      expect(store.temporal.getState().pastStates).toHaveLength(1);
      store.temporal.getState().undo();
      expect(store.getState().polygons).toEqual([square]);
      store.temporal.getState().redo();
      expect(store.getState().polygons).toEqual(expected);
    },
  );

  it("retains the hovered frame while adjusting controls off canvas", () => {
    const store = createEditorStore({ historyUpdateThrottle: 0 });
    const tool = new VertexTool(store);
    store.getState().actions.setPolygons([square]);
    tool.onActivate("frame");
    store.setState({ mouseOnCanvas: true, mousePosition: position(5, 5) });
    expect(
      tool.onPointerMove({} as PointerEvent, {
        worldPos: position(5, 5),
        screenX: 0,
        screenY: 0,
      }),
    ).toBe(false);
    const before = tool.getDrafts().polygons;
    store.setState({ mouseOnCanvas: false });
    expect(tool.getDrafts().polygons).toBe(before);
    tool.adjustFrameWidth(1);
    expect(tool.getDrafts().hiddenPolygons).toEqual([square]);
    expect(tool.getDrafts().polygons).not.toEqual(before);
    tool.cycleFrameMode();
    expect(tool.getDrafts().polygons).toEqual(
      createFramePolygons(square, 26 * ELMA_PIXEL_SCALE, "outside"),
    );
    tool.onActivate("cutConnect");
    expect(tool.getDrafts().replacementPolygons).toBeUndefined();
    tool.onActivate("frame");
    expect(tool.getDrafts().polygons).toEqual([]);
  });

  it("rejects collapsed, self-intersecting, grass and non-finite offsets", () => {
    expect(createFramePolygons(square, 5, "inside")).toBeNull();
    expect(createFramePolygons(square, 6, "inside")).toBeNull();
    expect(createFramePolygons(square, NaN, "inside")).toBeNull();
    expect(
      createFramePolygons({ ...square, grass: true }, 1, "inside"),
    ).toBeNull();
    expect(
      createFramePolygons(
        polygon([
          position(0, 0),
          position(10, 10),
          position(10, 0),
          position(0, 10),
        ]),
        1,
        "outside",
      ),
    ).toBeNull();
  });

  it("handles concave corners and closes narrow notches without rejecting the frame", () => {
    const concave = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 10),
      position(6, 10),
      position(6, 4),
      position(4, 4),
      position(4, 10),
      position(0, 10),
    ]);
    expect(createFramePolygons(concave, 0.5, "inside")).not.toBeNull();
    expect(createFramePolygons(concave, 0.5, "outside")).not.toBeNull();
    const result = createFramePolygons(concave, 2, "outside")!;
    expect(result).toHaveLength(2);
    expect(result[0].vertices).toEqual([
      position(-2, -2),
      position(12, -2),
      position(12, 12),
      position(-2, 12),
    ]);
    expect(result[1]).toBe(concave);
  });

  it.each(["inside", "centered"] as const)(
    "keeps both interiors when a narrow neck collapses (%s)",
    (mode) => {
      const vertices = [
        position(0, 0),
        position(10, 0),
        position(10, 4.5),
        position(20, 4.5),
        position(20, 0),
        position(30, 0),
        position(30, 10),
        position(20, 10),
        position(20, 5.5),
        position(10, 5.5),
        position(10, 10),
        position(0, 10),
      ];
      for (const winding of [vertices, [...vertices].reverse()]) {
        const source = polygon(winding);
        const result = createFramePolygons(
          source,
          mode === "inside" ? 1 : 2,
          mode,
        )!;
        expect(result).toHaveLength(3);
        expect(
          result
            .slice(1)
            .map(({ vertices }) => [
              Math.min(...vertices.map(({ x }) => x)),
              Math.max(...vertices.map(({ x }) => x)),
              Math.min(...vertices.map(({ y }) => y)),
              Math.max(...vertices.map(({ y }) => y)),
            ]),
        ).toEqual([
          [1, 9, 1, 9],
          [21, 29, 1, 9],
        ]);
        expect(source.vertices).toEqual(winding);
      }
    },
  );

  it("previews nested polygons and updates both outlines from keyboard controls", () => {
    const inner = polygon([
      position(3, 3),
      position(7, 3),
      position(7, 7),
      position(3, 7),
    ]);
    const tool = createVertexTool({
      polygons: [square, inner],
      mousePosition: position(5, 5),
      toolState: {
        variant: "frame",
        drawingPolygon: polygon([]),
        frameWidthPx: 10,
      },
    });
    expect(tool.getDrafts().hiddenPolygons).toEqual([inner]);
    const before = tool.getDrafts().polygons;
    const key = (value: string, repeat = false) =>
      tool.onKeyDown(
        { key: value, repeat, preventDefault() {} } as KeyboardEvent,
        {} as Parameters<VertexTool["onKeyDown"]>[1],
      );
    expect(key("+")).toBe(true);
    expect(tool.getDrafts().polygons).not.toEqual(before);
    expect(key(" ")).toBe(true);
    expect(tool.getToolState().frameMode).toBe("outside");
    key(" ", true);
    expect(tool.getToolState().frameMode).toBe("outside");
    key(" ");
    expect(tool.getToolState().frameMode).toBe("centered");
    key(" ");
    expect(tool.getToolState().frameMode).toBe("inside");
  });
});
