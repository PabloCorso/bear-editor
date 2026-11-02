import {
  buildGridOverlays,
  normalizeGridSettings,
  snapToGrid,
} from "~/editor/grid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "~/editor/editor-store";
import {
  Clip,
  Gravity,
  type Apple,
  type Picture,
  type Position,
} from "~/editor/elma-types";
import { defaultTools } from "./default-tools";
import { SelectTool, type SelectToolState } from "./select-tool";
import { getKuskiSelectionCircles } from "~/editor/kuski-geometry";

function position(x: number, y: number): Position {
  return { x, y } as Position;
}

function createTool() {
  const store = createEditorStore();
  const tool = new SelectTool(store);
  const firstApple = position(100, 100);
  const secondApple = position(200, 100);

  store.getState().actions.setApples([
    { position: firstApple, animation: 1, gravity: Gravity.None },
    { position: secondApple, animation: 1, gravity: Gravity.None },
  ]);
  store
    .getState()
    .actions.setToolState<SelectToolState>(defaultTools.select.id, {
      selectedVertices: [],
      selectedObjects: [],
      selectedPictures: [],
      isDragging: false,
      isMarqueeSelecting: false,
    });

  return { store, tool, firstApple, secondApple };
}

function rightClick(
  tool: SelectTool,
  worldPos: Position,
  modifiers: { metaKey?: boolean; ctrlKey?: boolean } = {},
) {
  return tool.onRightClick(
    {
      metaKey: modifiers.metaKey ?? false,
      ctrlKey: modifiers.ctrlKey ?? false,
    } as MouseEvent,
    { worldPos, screenX: 12, screenY: 34 },
  );
}

function dragMarquee(tool: SelectTool, from: Position, to: Position) {
  const event = {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  } as PointerEvent;

  tool.onPointerDown(event, { worldPos: from, screenX: 0, screenY: 0 });
  tool.onPointerMove(event, { worldPos: to, screenX: 0, screenY: 0 });
  tool.onPointerUp(event, { worldPos: to, screenX: 0, screenY: 0 });
}

function getSelection(store: ReturnType<typeof createEditorStore>) {
  return store
    .getState()
    .actions.getToolState<SelectToolState>(defaultTools.select.id);
}

describe("SelectTool mirroring", () => {
  it.each(["horizontal", "vertical"] as const)(
    "mirrors a mixed selection on the canvas %s axis in one undo step",
    (direction) => {
      const { store, tool, firstApple } = createTool();
      const polygon = {
        grass: false,
        vertices: [position(0, 0), position(20, 0), position(0, 30)],
      };
      store.getState().actions.setPolygons([polygon]);
      store
        .getState()
        .actions.setToolState<SelectToolState>(defaultTools.select.id, {
          selectedVertices: polygon.vertices.map((vertex) => ({
            polygon,
            vertex,
          })),
          selectedObjects: [firstApple],
          contextMenuType: "selection",
        });
      store.temporal.getState().clear();

      tool.mirrorSelection(direction);

      const reflected = (point: Position) => ({
        x: direction === "horizontal" ? 100 - point.x : point.x,
        y: direction === "vertical" ? 100 - point.y : point.y,
      });
      expect(store.getState().polygons[0].vertices).toEqual(
        polygon.vertices.map(reflected),
      );
      expect(store.getState().apples[0].position).toEqual(
        reflected(firstApple),
      );
      expect(store.getState().apples[1].position).toEqual(position(200, 100));
      expect(getSelection(store)?.selectedVertices[0].polygon).toBe(
        store.getState().polygons[0],
      );
      expect(getSelection(store)?.selectedObjects[0]).toBe(
        store.getState().apples[0].position,
      );
      expect(getSelection(store)?.contextMenuType).toBeUndefined();
      expect(store.temporal.getState().pastStates).toHaveLength(1);

      tool.mirrorSelection(direction);
      expect(store.getState().polygons[0]).toEqual(polygon);
      expect(store.getState().apples[0].position).toEqual(firstApple);
      store.temporal.getState().undo();
      expect(store.getState().apples[0].position).toEqual(
        reflected(firstApple),
      );
      store.temporal.getState().undo();
      expect(store.getState().polygons[0]).toEqual(polygon);
      expect(store.getState().apples[0].position).toEqual(firstApple);
    },
  );

  it("reflects picture centres while preserving sprite dimensions and properties", () => {
    const { store, tool } = createTool();
    const pictures = [
      {
        name: "first",
        texture: "",
        mask: "" as const,
        clip: Clip.Unclipped,
        distance: 500,
        position: position(0, 0),
      },
      {
        name: "second",
        texture: "",
        mask: "" as const,
        clip: Clip.Unclipped,
        distance: 500,
        position: position(20, 20),
      },
    ];
    store.getState().actions.setPictures(pictures);
    tool.setPictureDimensionsResolver((picture) =>
      picture.name === "first"
        ? { width: 10, height: 10 }
        : { width: 20, height: 20 },
    );
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedPictures: pictures.map((picture) => picture.position),
      });

    tool.mirrorSelection("horizontal");
    expect(store.getState().pictures).toEqual([
      { ...pictures[0], position: position(25, 0) },
      { ...pictures[1], position: position(-5, 20) },
    ]);
    tool.mirrorSelection("vertical");
    expect(store.getState().pictures).toEqual([
      { ...pictures[0], position: position(25, 25) },
      { ...pictures[1], position: position(-5, -5) },
    ]);
  });

  it.each(["horizontal", "vertical"] as const)(
    "mirrors the level start from its wheel midpoint on the %s axis",
    (direction) => {
      const { store, tool, firstApple } = createTool();
      const start = position(10, 20);
      store.getState().actions.setStart(start);
      store
        .getState()
        .actions.setToolState<SelectToolState>(defaultTools.select.id, {
          selectedObjects: [start, firstApple],
        });

      const wheels = getKuskiSelectionCircles({ start }).slice(0, 2);
      const wheelMidpoint = position(
        (wheels[0].x + wheels[1].x) / 2,
        (wheels[0].y + wheels[1].y) / 2,
      );
      const center = position(
        (wheelMidpoint.x + firstApple.x) / 2,
        (wheelMidpoint.y + firstApple.y) / 2,
      );
      const reflectedWheelMidpoint = position(
        direction === "horizontal"
          ? 2 * center.x - wheelMidpoint.x
          : wheelMidpoint.x,
        direction === "vertical"
          ? 2 * center.y - wheelMidpoint.y
          : wheelMidpoint.y,
      );
      const expectedStart = position(
        reflectedWheelMidpoint.x - wheelMidpoint.x + start.x,
        reflectedWheelMidpoint.y - wheelMidpoint.y + start.y,
      );

      tool.mirrorSelection(direction);

      expect(store.getState().start).toEqual(expectedStart);
      tool.mirrorSelection(direction);
      expect(store.getState().start.x).toBeCloseTo(start.x);
      expect(store.getState().start.y).toBeCloseTo(start.y);
    },
  );
});

describe("SelectTool right-click selection context menu", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      navigator: { platform: "MacIntel" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("selects a selectable right-click target when nothing is selected", () => {
    const { store, tool, firstApple } = createTool();

    expect(rightClick(tool, firstApple)).toBe(true);

    expect(getSelection(store)).toMatchObject({
      selectedObjects: [firstApple],
      selectedVertices: [],
      selectedPictures: [],
      contextMenuType: "selection",
      contextMenuPosition: { x: 12, y: 34 },
    });
  });

  it("keeps the whole current selection when right-clicking inside it", () => {
    const { store, tool, firstApple, secondApple } = createTool();
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedObjects: [firstApple, secondApple],
      });

    expect(rightClick(tool, firstApple)).toBe(true);

    expect(getSelection(store)?.selectedObjects).toEqual([
      firstApple,
      secondApple,
    ]);
    expect(getSelection(store)?.contextMenuType).toBe("selection");
  });

  it("keeps the current selection when right-clicking empty canvas", () => {
    const { store, tool, firstApple } = createTool();
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedObjects: [firstApple],
      });

    expect(rightClick(tool, position(500, 500))).toBe(true);

    expect(getSelection(store)?.selectedObjects).toEqual([firstApple]);
    expect(getSelection(store)?.contextMenuType).toBe("selection");
  });

  it("replaces the current selection when right-clicking another selectable target", () => {
    const { store, tool, firstApple, secondApple } = createTool();
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedObjects: [firstApple],
      });

    expect(rightClick(tool, secondApple)).toBe(true);

    expect(getSelection(store)?.selectedObjects).toEqual([secondApple]);
    expect(getSelection(store)?.contextMenuType).toBe("selection");
  });

  it("adds another right-click target to the selection with the modifier key", () => {
    const { store, tool, firstApple, secondApple } = createTool();
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedObjects: [firstApple],
      });

    expect(rightClick(tool, secondApple, { metaKey: true })).toBe(true);

    expect(getSelection(store)?.selectedObjects).toEqual([
      firstApple,
      secondApple,
    ]);
    expect(getSelection(store)?.contextMenuType).toBe("selection");
  });

  it("closes the context menu before clearing the selection with escape", () => {
    const { store, tool, firstApple } = createTool();
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedObjects: [firstApple],
        contextMenuType: "selection",
        contextMenuPosition: { x: 12, y: 34 },
      });

    expect(
      tool.onKeyDown({ key: "Escape" } as KeyboardEvent, {
        worldPos: position(0, 0),
        screenX: 0,
        screenY: 0,
      }),
    ).toBe(true);

    expect(getSelection(store)?.contextMenuType).toBeUndefined();
    expect(getSelection(store)?.selectedObjects).toEqual([firstApple]);

    expect(
      tool.onKeyDown({ key: "Escape" } as KeyboardEvent, {
        worldPos: position(0, 0),
        screenX: 0,
        screenY: 0,
      }),
    ).toBe(true);

    expect(getSelection(store)?.selectedObjects).toEqual([]);
  });

  it("duplicates the selection with the modifier and D shortcut", () => {
    const { store, tool, firstApple } = createTool();
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedObjects: [firstApple],
      });
    const event = {
      key: "d",
      metaKey: true,
      ctrlKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    expect(
      tool.onKeyDown(event, {
        worldPos: position(0, 0),
        screenX: 0,
        screenY: 0,
      }),
    ).toBe(true);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(store.getState().apples).toHaveLength(3);
    expect(getSelection(store)?.selectedObjects).toHaveLength(1);
    expect(getSelection(store)?.selectedObjects[0]).not.toBe(firstApple);
  });

  it("keeps flowers selected when filtering vertices out of a mixed object selection", () => {
    const { store, tool, firstApple } = createTool();
    const flower = position(300, 100);
    const grassVertex = position(10, 10);
    const grassPolygon = {
      grass: true,
      vertices: [grassVertex, position(20, 10), position(20, 20)],
    };

    store.getState().actions.setFlowers([flower]);
    store.getState().actions.setPolygons([grassPolygon]);
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedVertices: [{ polygon: grassPolygon, vertex: grassVertex }],
        selectedObjects: [firstApple, flower],
        selectedPictures: [],
        isDragging: false,
        isMarqueeSelecting: false,
        contextMenuType: "selection",
      });

    expect(
      tool.selectSelectionKinds(new Set(["apples", "flowers"]), undefined, {
        closeContextMenu: false,
      }),
    ).toBe(true);

    expect(getSelection(store)).toMatchObject({
      selectedVertices: [],
      selectedObjects: [firstApple, flower],
      contextMenuType: "selection",
    });
  });
});

describe("SelectTool marquee selection", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      navigator: { platform: "MacIntel" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("selects objects when the marquee intersects their visual bounds", () => {
    const { store, tool, firstApple } = createTool();
    store.getState().actions.setZoom(100);

    dragMarquee(tool, position(100.39, 99), position(100.6, 101));

    expect(getSelection(store)?.selectedObjects).toEqual([firstApple]);
  });

  it("selects pictures when the marquee intersects their rendered bounds", () => {
    const { store, tool } = createTool();
    const picturePosition = position(10, 10);

    tool.setPictureDimensionsResolver(() => ({ width: 5, height: 5 }));
    store.getState().actions.setPictures([
      {
        name: "picture",
        texture: "",
        mask: "",
        position: picturePosition,
        distance: 100,
        clip: Clip.Unclipped,
      },
    ]);

    dragMarquee(tool, position(14, 14), position(20, 20));

    expect(getSelection(store)?.selectedPictures).toEqual([picturePosition]);
  });
});

describe("SelectTool polygon edge dragging", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { navigator: { platform: "MacIntel" } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const event = {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  } as PointerEvent;
  const context = (worldPos: Position) => ({
    worldPos,
    screenX: 0,
    screenY: 0,
  });

  function setup(selectedVertexIndexes: number[], grass = false) {
    const { store, tool } = createTool();
    const polygon = {
      grass,
      vertices: [
        position(0, 0),
        position(20, 0),
        position(20, 20),
        position(0, 20),
      ],
    };
    store.getState().actions.setPolygons([polygon]);
    store.getState().actions.setZoom(100);
    store.getState().actions.setMouseOnCanvas(true);
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedVertices: selectedVertexIndexes.map((index) => ({
          polygon,
          vertex: polygon.vertices[index],
        })),
      });
    store.temporal.getState().clear();
    return { store, tool, polygon };
  }

  function dragTopEdge(tool: SelectTool) {
    tool.onPointerDown(event, context(position(10, 0)));
    tool.onPointerMove(event, context(position(13, 4)));
    tool.onPointerUp(event, context(position(13, 4)));
  }

  function getPolygonLines(tool: SelectTool) {
    return tool
      .getWorldOverlays({
        viewportRect: { minX: -10, minY: -10, maxX: 30, maxY: 30 },
      })
      .filter((item) => item.type === "polyline");
  }

  it("does not outline the polygon when only one vertex is selected", () => {
    const { store, tool } = setup([0]);
    store.getState().actions.setMousePosition(position(10, 10));

    expect(getPolygonLines(tool)).toHaveLength(0);
  });

  it("moves two selected endpoint vertices when dragging their shared edge", () => {
    const { store, tool } = setup([0, 1]);
    store.getState().actions.setMousePosition(position(10, 0));

    expect(getPolygonLines(tool)).toMatchObject([
      {
        points: [position(0, 0), position(20, 0)],
        closed: false,
      },
    ]);

    dragTopEdge(tool);

    expect(store.getState().polygons[0].vertices).toEqual([
      position(3, 4),
      position(23, 4),
      position(20, 20),
      position(0, 20),
    ]);
    expect(getSelection(store)?.selectedVertices).toHaveLength(2);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
  });

  it("does not outline a grass polygon's implicit closing edge", () => {
    const { store, tool } = setup([0, 1], true);
    store.getState().actions.setMousePosition(position(10, 0));

    expect(getPolygonLines(tool)).toHaveLength(0);
  });

  it("does not hover an overlapping polygon above a selected edge", () => {
    const { store, tool, polygon: selectedPolygon } = setup([0, 1]);
    const unselectedPolygon = {
      grass: false,
      vertices: [
        position(0, 0),
        position(20, 0),
        position(20, 20),
        position(0, 20),
      ],
    };
    store.getState().actions.setPolygons([unselectedPolygon, selectedPolygon]);
    store.getState().actions.setMousePosition(position(10, 0));

    expect(getPolygonLines(tool)).toMatchObject([
      {
        points: [position(0, 0), position(20, 0)],
        closed: false,
      },
    ]);
  });

  it("selects and moves the whole polygon when the edge endpoints are not both selected", () => {
    const { store, tool } = setup([0, 2]);
    store.getState().actions.setMousePosition(position(10, 0));

    expect(getPolygonLines(tool)).toMatchObject([{ closed: true }]);

    dragTopEdge(tool);

    expect(store.getState().polygons[0].vertices).toEqual([
      position(3, 4),
      position(23, 4),
      position(23, 24),
      position(3, 24),
    ]);
    expect(getSelection(store)?.selectedVertices).toHaveLength(4);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
  });
});

describe("Grid", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { navigator: { platform: "Linux" } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("normalizes invalid and legacy preferences", () => {
    expect(normalizeGridSettings()).toEqual({
      visible: false,
      snap: false,
      size: 1,
    });
    expect(normalizeGridSettings({ size: NaN }).size).toBe(1);
    expect(normalizeGridSettings({ size: 0 }).size).toBe(0.01);
    expect(
      snapToGrid(position(-1.7, 2.2), {
        visible: false,
        snap: true,
        size: 0.5,
      }),
    ).toEqual(position(-1.5, 2));
  });
  it("bounds grid rendering at minimum zoom without changing snap spacing", () => {
    const grid = { visible: true, snap: true, size: 0.01 };
    const lines = buildGridOverlays(
      grid,
      { minX: -10000, minY: -10000, maxX: 10000, maxY: 10000 },
      0.2,
    );
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThan(2005);
    expect(grid.size).toBe(0.01);
  });
  it.each([false, true])(
    "moves a selection by one shared translation with Alt bypass %s",
    (altKey) => {
      const { store, tool, firstApple, secondApple } = createTool();
      // Pointer modifiers must override stale stored preview modifiers.
      store.getState().actions.setGridSnapBypassed(!altKey);
      store.getState().actions.setGrid({ snap: true, size: 3 });
      store.getState().actions.setToolState<SelectToolState>("select", {
        selectedObjects: [firstApple, secondApple],
      });
      const event = {
        altKey,
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
      } as PointerEvent;
      tool.onPointerDown(event, {
        worldPos: firstApple,
        screenX: 0,
        screenY: 0,
      });
      const destination = position(104.2, 102.2);
      tool.onPointerMove(event, {
        worldPos: destination,
        screenX: 4,
        screenY: 2,
      });
      tool.onPointerUp(event, {
        worldPos: destination,
        screenX: 4,
        screenY: 2,
      });
      const [first, second] = store.getState().apples;
      expect(first.position.x).toBeCloseTo(altKey ? 104.2 : 105);
      expect(first.position.y).toBeCloseTo(altKey ? 102.2 : 102);
      expect(second.position.x - first.position.x).toBeCloseTo(100);
      expect(second.position.y - first.position.y).toBeCloseTo(0);
    },
  );
});

// Exercise the public pointer workflow so preview, cancellation and history
// are checked together with the geometry.
describe("SelectTool skewing", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { navigator: { platform: "MacIntel" } });
  });

  afterEach(() => vi.unstubAllGlobals());

  function createSkewTool() {
    const result = createTool();
    const { store, tool } = result;
    const polygon = {
      grass: false,
      vertices: [
        position(0, 0),
        position(20, 0),
        position(20, 30),
        position(0, 30),
      ],
    };
    store.getState().actions.setPolygons([polygon]);
    store.getState().actions.setZoom(100);
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedVertices: polygon.vertices.map((vertex) => ({
          polygon,
          vertex,
        })),
      });
    store.temporal.getState().clear();
    tool.toggleTransform(true);
    return { ...result, polygon };
  }

  const event = {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  } as PointerEvent;
  const context = (worldPos: Position) => ({
    worldPos,
    screenX: 0,
    screenY: 0,
  });

  it.each([
    {
      side: "top",
      from: position(10, 0),
      to: position(16, 9),
      expected: [
        position(6, 0),
        position(26, 0),
        position(20, 30),
        position(0, 30),
      ],
      cursor: "ew-resize",
    },
    {
      side: "bottom",
      from: position(10, 30),
      to: position(4, 39),
      expected: [
        position(0, 0),
        position(20, 0),
        position(14, 30),
        position(-6, 30),
      ],
      cursor: "ew-resize",
    },
    {
      side: "left",
      from: position(0, 15),
      to: position(9, 21),
      expected: [
        position(0, 6),
        position(20, 0),
        position(20, 30),
        position(0, 36),
      ],
      cursor: "ns-resize",
    },
    {
      side: "right",
      from: position(20, 15),
      to: position(29, 9),
      expected: [
        position(0, 0),
        position(20, -6),
        position(20, 24),
        position(0, 30),
      ],
      cursor: "ns-resize",
    },
  ])(
    "skews from the $side handle with the opposite edge fixed",
    ({ from, to, expected, cursor }) => {
      const { store, tool, polygon } = createSkewTool();
      expect(tool.getCursor(context(from))).toBe(cursor);
      tool.onPointerDown(event, context(from));
      tool.onPointerMove(event, context(to));
      expect(store.getState().polygons[0].vertices).toEqual(expected);
      const overlays = tool.getWorldOverlays({
        viewportRect: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
      });
      expect(overlays.filter((item) => item.type === "rect")).toHaveLength(4);
      expect(
        overlays.some(
          (item) =>
            item.type === "polyline" &&
            JSON.stringify(item.points) === JSON.stringify(expected),
        ),
      ).toBe(true);
      expect(store.temporal.getState().pastStates).toHaveLength(0);
      tool.onPointerUp(event, context(to));
      expect(store.temporal.getState().pastStates).toHaveLength(1);
      expect(getSelection(store)?.selectedVertices[0].polygon).toBe(
        store.getState().polygons[0],
      );
      store.temporal.getState().undo();
      expect(store.getState().polygons).toEqual([polygon]);
      store.temporal.getState().redo();
      expect(store.getState().polygons[0].vertices).toEqual(expected);
    },
  );

  it.each(["Escape", "pointercancel"])(
    "cancels the preview with %s without adding history",
    (cancel) => {
      const { store, tool, polygon } = createSkewTool();
      tool.onPointerDown(event, context(position(10, 0)));
      tool.onPointerMove(event, context(position(16, 0)));
      if (cancel === "Escape") {
        tool.onKeyDown(
          { key: "Escape", preventDefault() {} } as KeyboardEvent,
          context(position(16, 0)),
        );
      } else {
        tool.onPointerUp(
          { ...event, type: "pointercancel" } as PointerEvent,
          context(position(16, 0)),
        );
      }
      expect(store.getState().polygons).toEqual([polygon]);
      expect(getSelection(store)?.selectedVertices[0].polygon).toBe(
        store.getState().polygons[0],
      );
      expect(store.temporal.getState().pastStates).toHaveLength(0);
      expect(store.temporal.getState().isTracking).toBe(true);
    },
  );

  it("moves mixed selection positions without changing picture or object properties", () => {
    const { store, tool, polygon, secondApple } = createSkewTool();
    const apple: Apple = {
      position: position(5, 15),
      animation: 3,
      gravity: Gravity.Up,
    };
    const picture: Picture = {
      name: "tree",
      texture: "",
      mask: "",
      position: position(5, 5),
      distance: 500,
      clip: Clip.Unclipped,
    };
    store
      .getState()
      .actions.setApples([
        apple,
        { position: secondApple, animation: 1, gravity: Gravity.None },
      ]);
    store.getState().actions.setPictures([picture]);
    tool.setPictureDimensionsResolver(() => ({ width: 10, height: 10 }));
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedObjects: [apple.position],
        selectedPictures: [picture.position],
      });
    store.temporal.getState().clear();
    dragMarquee(tool, position(10, 0), position(16, 0));
    expect(store.getState().polygons[0].vertices[0]).toEqual(position(6, 0));
    expect(store.getState().apples[0]).toEqual({
      ...apple,
      position: position(8, 15),
    });
    expect(store.getState().pictures[0]).toEqual({
      ...picture,
      position: position(9, 5),
    });
    expect(store.getState().apples[1].position).toEqual(secondApple);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
    store.temporal.getState().undo();
    expect(store.getState().polygons[0]).toEqual(polygon);
    expect(store.getState().pictures[0]).toEqual(picture);
    expect(store.getState().apples[0]).toEqual(apple);
  });

  it("does not add history for a perpendicular drag or a return to the starting point", () => {
    const { store, tool, polygon } = createSkewTool();
    dragMarquee(tool, position(10, 0), position(10, 9));
    expect(store.getState().polygons).toEqual([polygon]);
    tool.onPointerDown(event, context(position(10, 0)));
    tool.onPointerMove(event, context(position(16, 0)));
    tool.onPointerMove(event, context(position(10, 0)));
    tool.onPointerUp(event, context(position(10, 0)));
    expect(store.getState().polygons).toEqual([polygon]);
    expect(store.temporal.getState().pastStates).toHaveLength(0);
  });

  it("keeps the skewed frame for the next skew and switches cleanly to resize and rotate", () => {
    const { store, tool } = createSkewTool();
    dragMarquee(tool, position(10, 0), position(16, 0));
    const skewedFrame = [
      position(6, 0),
      position(26, 0),
      position(20, 30),
      position(0, 30),
    ];
    expect(
      tool
        .getWorldOverlays({
          viewportRect: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
        })
        .filter((item) => item.type === "polyline")
        .find((item) => item.points.length === skewedFrame.length)?.points,
    ).toEqual(skewedFrame);
    expect(tool.getCursor(context(position(16, 0)))).toBe("ew-resize");
    dragMarquee(tool, position(16, 0), position(22, 0));
    expect(store.getState().polygons[0].vertices[0]).toEqual(position(12, 0));
    expect(store.temporal.getState().pastStates).toHaveLength(2);
    tool.toggleTransform();
    expect(getSelection(store)).toMatchObject({
      transformMode: true,
      skewMode: false,
    });
    expect(tool.getCursor(context(position(16, 0)))).toBe("ns-resize");
    tool.toggleTransform(true);
    expect(getSelection(store)).toMatchObject({
      transformMode: true,
      skewMode: true,
    });
    tool.toggleTransform(true);
    expect(getSelection(store)?.transformMode).toBe(false);
  });

  it("moves the selection and its skew handles together", () => {
    const { tool } = createSkewTool();
    tool.onPointerDown(event, context(position(0, 0)));
    tool.onPointerMove(event, context(position(3, 4)));
    const handles = tool
      .getWorldOverlays({
        viewportRect: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
      })
      .filter((item) => item.type === "rect")
      .map((item) => ({
        x: item.position.x + item.width / 2,
        y: item.position.y + item.height / 2,
      }));
    expect(handles).toEqual([
      position(13, 4),
      position(13, 34),
      position(3, 19),
      position(23, 19),
    ]);
    tool.onPointerUp(event, context(position(3, 4)));
  });

  it("supports a collinear selection without dividing by zero", () => {
    const { store, tool, polygon } = createSkewTool();
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedVertices: polygon.vertices
          .slice(0, 2)
          .map((vertex) => ({ polygon, vertex })),
      });
    dragMarquee(tool, position(20, 0), position(20, 10));
    expect(store.getState().polygons[0].vertices).toEqual([
      position(0, 0),
      position(20, 10),
      position(20, 30),
      position(0, 30),
    ]);
  });

  it("skews both copies of a repeated grass endpoint", () => {
    const { store, tool } = createTool();
    const grass = {
      grass: true,
      vertices: [position(0, 0), position(20, 0), position(20, 0)],
    };
    store.getState().actions.setPolygons([grass]);
    store.getState().actions.setZoom(100);
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedVertices: grass.vertices.map((vertex) => ({
          polygon: grass,
          vertex,
        })),
      });
    tool.toggleTransform(true);

    const selectedVertices = getSelection(store)?.selectedVertices ?? [];
    expect(selectedVertices[1]?.vertex).not.toBe(selectedVertices[2]?.vertex);

    dragMarquee(tool, position(20, 0), position(20, 10));

    expect(store.getState().polygons[0].vertices).toEqual([
      position(0, 0),
      position(20, 10),
      position(20, 10),
    ]);
  });
});

describe("SelectTool transform measurements", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { navigator: { platform: "MacIntel" } });
  });
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    const result = createTool();
    const polygon = {
      grass: false,
      vertices: [
        position(0, 0),
        position(10, 0),
        position(10, 20),
        position(0, 20),
      ],
    };
    result.store.getState().actions.setPolygons([polygon]);
    result.store.getState().actions.setZoom(100);
    result.store.getState().actions.setToolState<SelectToolState>("select", {
      selectedVertices: polygon.vertices.map((vertex) => ({ polygon, vertex })),
    });
    result.store.temporal.getState().clear();
    result.tool.toggleTransform();
    return { ...result, polygon };
  }

  it("updates live during pointer resize and rotation, restores on cancel, and resets when reactivated", () => {
    const { tool } = setup();
    const event = {
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    } as PointerEvent;
    const context = (worldPos: Position) => ({
      worldPos,
      screenX: 0,
      screenY: 0,
    });
    tool.onPointerDown(event, context(position(10, 10)));
    tool.onPointerMove(event, context(position(5, 10)));
    expect(tool.getTransformMeasurements()).toMatchObject({
      width: 5,
      height: 20,
      scaleX: 50,
    });
    tool.onPointerUp(event, context(position(5, 10)));
    tool.onPointerDown(event, context(position(5.1, -0.1)));
    tool.onPointerMove(event, context(position(12.6, 12.6)));
    expect(tool.getTransformMeasurements()?.angle).not.toBe(0);
    expect(tool.getTransformMeasurements()?.width).toBeCloseTo(5);
    expect(tool.getTransformMeasurements()?.height).toBeCloseTo(20);
    tool.onPointerUp(
      { ...event, type: "pointercancel" } as PointerEvent,
      context(position(12.6, 12.6)),
    );
    expect(tool.getTransformMeasurements()).toMatchObject({
      width: 5,
      angle: 0,
      scaleX: 50,
    });
    tool.toggleTransform();
    tool.toggleTransform();
    expect(tool.getTransformMeasurements()).toMatchObject({
      width: 5,
      scaleX: 100,
      scaleY: 100,
      angle: 0,
    });
  });
});

describe("SelectTool lasso selection", () => {
  beforeEach(() =>
    vi.stubGlobal("window", { navigator: { platform: "Linux" } }),
  );
  afterEach(() => vi.unstubAllGlobals());

  function drawLasso(
    tool: SelectTool,
    points: Position[],
    additive = false,
    cancel = false,
  ) {
    const event = { ctrlKey: additive, metaKey: additive } as PointerEvent;
    const context = (worldPos: Position) => ({
      worldPos,
      screenX: 0,
      screenY: 0,
    });
    tool.onPointerDown(event, context(points[0]));
    for (const point of points.slice(1))
      tool.onPointerMove(event, context(point));
    tool.onPointerUp(
      {
        ...event,
        type: cancel ? "pointercancel" : "pointerup",
      } as PointerEvent,
      context(points.at(-1)!),
    );
  }

  it("selects inside a concave path without selecting vertices in its bounding box cutout", () => {
    const { store, tool } = createTool();
    const polygon = {
      grass: false,
      vertices: [position(20, 20), position(80, 80), position(20, 80)],
    };
    store.getState().actions.setPolygons([polygon]);
    tool.onActivate("lasso");
    drawLasso(tool, [
      position(-20, -20),
      position(110, -20),
      position(110, 40),
      position(40, 40),
      position(40, 110),
      position(-20, 110),
    ]);
    expect(
      getSelection(store)?.selectedVertices.map(({ vertex }) => vertex),
    ).toEqual([polygon.vertices[0], polygon.vertices[2]]);
  });

  it("selects pictures and objects touched by the path and supports additive selection", () => {
    const { store, tool, firstApple, secondApple } = createTool();
    store.getState().actions.setToolState<SelectToolState>("select", {
      selectedObjects: [secondApple],
    });
    const picture = {
      name: "test",
      texture: "",
      mask: "" as const,
      clip: Clip.Unclipped,
      distance: 500,
      position: position(100, 102),
    };
    store.getState().actions.setPictures([picture]);
    tool.setPictureDimensionsResolver(() => ({ width: 10, height: 10 }));
    tool.onActivate("lasso");
    drawLasso(
      tool,
      [
        position(70, 70),
        position(130, 70),
        position(130, 105),
        position(70, 105),
      ],
      true,
    );
    expect(getSelection(store)?.selectedObjects).toEqual([
      secondApple,
      firstApple,
    ]);
    expect(getSelection(store)?.selectedPictures).toEqual([picture.position]);
  });

  it("selects session test starts by their bike footprint in either area mode", () => {
    for (const variant of ["marquee", "lasso"] as const) {
      const { store, tool } = createTool();
      store.getState().actions.setZoom(100);
      store.getState().actions.addTestStart(position(50, 50));
      const start = store.getState().testStarts.items[0].position;
      const circle = getKuskiSelectionCircles({ start })[0];
      // Touch the bike footprint away from its position anchor.
      const x = circle.x + circle.radius * 0.8;
      const y = circle.y;
      tool.onActivate(variant);
      drawLasso(tool, [
        position(x + 5, y - 5),
        position(x + 0.01, y - 5),
        position(x + 0.01, y + 0.01),
        position(x - 0.01, y + 0.01),
      ]);
      expect(getSelection(store)?.selectedObjects).toContain(start);
    }
  });

  it("preserves selection when switching modes and remembers the mode after clearing", () => {
    const { store, tool, secondApple } = createTool();
    store.getState().actions.setToolState<SelectToolState>("select", {
      selectedObjects: [secondApple],
    });
    tool.onActivate("lasso");
    tool.onPointerDown({} as PointerEvent, {
      worldPos: position(-20, -20),
      screenX: 0,
      screenY: 0,
    });
    tool.onActivate("marquee");
    expect(getSelection(store)?.selectedObjects).toEqual([secondApple]);
    expect(getSelection(store)?.isMarqueeSelecting).toBe(false);
    tool.onActivate("lasso");
    tool.clear();
    tool.onActivate();
    expect(getSelection(store)?.variant).toBe("lasso");
  });

  it("restores the previous selection on pointer cancellation or Escape", () => {
    const { store, tool, secondApple } = createTool();
    store.getState().actions.setToolState<SelectToolState>("select", {
      selectedObjects: [secondApple],
    });
    tool.onActivate("lasso");
    drawLasso(
      tool,
      [position(-20, -20), position(40, -20), position(40, 40)],
      false,
      true,
    );
    expect(getSelection(store)?.selectedObjects).toEqual([secondApple]);
    tool.onPointerDown({} as PointerEvent, {
      worldPos: position(-20, -20),
      screenX: 0,
      screenY: 0,
    });
    tool.onKeyDown({ key: "Escape", preventDefault() {} } as KeyboardEvent, {
      worldPos: position(-20, -20),
      screenX: 0,
      screenY: 0,
    });
    expect(getSelection(store)?.selectedObjects).toEqual([secondApple]);
    expect(getSelection(store)?.isMarqueeSelecting).toBe(false);
  });
});
