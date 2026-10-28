import {
  SmartGuideDrag,
  getGuideBoundsAnchors,
} from "~/editor/helpers/smart-guides";
import { loadEditorPreferences } from "~/editor/editor-preferences";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "~/editor/editor-store";
import { Clip, Gravity, type Position } from "~/editor/elma-types";
import { defaultTools } from "./default-tools";
import { SelectTool, type SelectToolState } from "./select-tool";

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

describe("Smart guides", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      navigator: { platform: "Linux" },
      localStorage: { getItem: () => null },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("finds alignment independently on each axis and only moves when snapping", () => {
    const drag = new SmartGuideDrag(
      [position(10, 10)],
      [position(100, 50), position(80, 200)],
    );
    expect(drag.resolve(position(86, 186), 1, false).delta).toEqual(
      position(86, 186),
    );
    const snapped = drag.resolve(position(86, 186), 1, true);
    expect(snapped.delta).toEqual(position(90, 190));
    expect(snapped.matches).toHaveLength(2);
    expect(snapped.matches[0].source).toEqual(position(100, 200));
  });

  it("uses screen pixels at every zoom and releases after the wider hysteresis radius", () => {
    const drag = new SmartGuideDrag([position(0, 0)], [position(100, 100)]);
    expect(drag.resolve(position(97, 90), 2, true).delta.x).toBe(100);
    expect(drag.resolve(position(104, 90), 2, true).delta.x).toBe(100);
    expect(drag.resolve(position(106, 90), 2, true).delta.x).toBe(106);
    drag.reset();
    expect(drag.resolve(position(96, 90), 2, true).delta.x).toBe(96);
  });

  it("chooses the nearest perpendicular target for ties and ignores distant and invalid points", () => {
    const drag = new SmartGuideDrag(
      [position(0, 0)],
      [
        position(100, 500),
        position(100, 30),
        position(99, 900),
        position(NaN, 10),
      ],
    );
    expect(drag.resolve(position(96, 0), 1, true).matches[0].target).toEqual(
      position(100, 30),
    );
  });

  it("aligns bounding edges and centers", () => {
    const anchors = getGuideBoundsAnchors({
      minX: 0,
      minY: 0,
      maxX: 20,
      maxY: 10,
    });
    const drag = new SmartGuideDrag(anchors, [position(100, 100)]);
    expect(drag.resolve(position(77, 50), 1, true).delta.x).toBe(80);
  });

  function setupGuidedDrag(show = true, snap = true) {
    const fixture = createTool();
    const { store, tool, firstApple } = fixture;
    store.setState({
      showSmartGuides: show,
      snapToSmartGuides: snap,
      polygons: [],
      killers: [],
      flowers: [],
      start: position(-1000, -1000),
      apples: [
        store.getState().apples[0],
        { position: position(200, 200), animation: 1, gravity: Gravity.None },
      ],
    });
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedObjects: [firstApple],
      });
    store.temporal.getState().clear();
    const event = {
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    } as PointerEvent;
    const context = (x: number, y: number) => ({
      worldPos: position(x, y),
      screenX: x,
      screenY: y,
    });
    tool.onPointerDown(event, context(100, 100));
    return { ...fixture, event, context };
  }

  it("snaps object centers in one undo step and clears guides on release", () => {
    const { store, tool, event, context } = setupGuidedDrag();
    tool.onPointerMove(event, context(196, 196));
    expect(store.getState().apples[0].position).toEqual(position(200, 200));
    const viewportRect = { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };
    expect(
      tool
        .getWorldOverlays({ viewportRect })
        .some((o) => "color" in o && o.color === "#ed66d5"),
    ).toBe(true);
    tool.onPointerUp(event, context(196, 196));
    expect(
      tool
        .getWorldOverlays({ viewportRect })
        .some((o) => "color" in o && o.color === "#ed66d5"),
    ).toBe(false);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
    store.temporal.getState().undo();
    expect(store.getState().apples[0].position).toEqual(position(100, 100));
  });

  it("supports visual-only guides, Alt bypass and returning to the drag origin", () => {
    const { store, tool, event, context } = setupGuidedDrag(true, false);
    tool.onPointerMove(event, context(196, 196));
    expect(store.getState().apples[0].position).toEqual(position(196, 196));
    store.setState({ snapToSmartGuides: true });
    tool.onPointerMove(event, context(196, 196));
    expect(store.getState().apples[0].position).toEqual(position(200, 200));
    tool.onPointerMove(
      { ...event, altKey: true } as PointerEvent,
      context(196, 196),
    );
    expect(store.getState().apples[0].position).toEqual(position(196, 196));
    tool.onPointerMove(event, context(100, 100));
    expect(store.getState().apples[0].position).toEqual(position(100, 100));
    tool.onPointerUp(event, context(100, 100));
  });

  it("leaves movement unchanged with both settings off and excludes hidden targets", () => {
    const { store, tool, event, context } = setupGuidedDrag(false, false);
    tool.onPointerMove(event, context(196, 196));
    expect(store.getState().apples[0].position).toEqual(position(196, 196));
    tool.onPointerUp(event, context(196, 196));
    store.setState({ showSmartGuides: true, snapToSmartGuides: true });
    store.getState().actions.setLevelVisibility({
      showObjects: false,
      showObjectBounds: false,
    });
    const polygon = {
      grass: false,
      vertices: [position(100, 100), position(110, 100), position(110, 110)],
    };
    store.getState().actions.setPolygons([polygon]);
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedVertices: [{ polygon, vertex: polygon.vertices[0] }],
        selectedObjects: [],
        selectedPictures: [],
      });
    tool.onPointerDown(event, context(100, 100));
    tool.onPointerMove(event, context(196, 196));
    expect(store.getState().polygons[0].vertices[0]).toEqual(
      position(196, 196),
    );
    tool.onPointerUp(event, context(196, 196));
  });

  it("moves mixed vertices, objects and picture bounds by one shared delta", () => {
    const { store, tool } = createTool();
    const vertex = position(100, 100);
    const polygon = {
      grass: false,
      vertices: [vertex, position(110, 100), position(100, 110)],
    };
    const object = position(120, 120);
    const picture = {
      name: "test",
      texture: "",
      mask: "",
      position: position(130, 130),
      distance: 500,
      clip: Clip.Unclipped,
    };
    store.setState({
      showSmartGuides: true,
      snapToSmartGuides: true,
      polygons: [polygon],
      apples: [
        { position: object, animation: 1, gravity: Gravity.None },
        { position: position(300, 300), animation: 1, gravity: Gravity.None },
      ],
      pictures: [picture],
      killers: [],
      flowers: [],
      start: position(-1000, -1000),
    });
    tool.setPictureDimensionsResolver(() => ({ width: 10, height: 10 }));
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedVertices: [{ polygon, vertex }],
        selectedObjects: [object],
        selectedPictures: [picture.position],
      });
    const event = {
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    } as PointerEvent;
    const context = (x: number, y: number) => ({
      worldPos: position(x, y),
      screenX: x,
      screenY: y,
    });
    tool.onPointerDown(event, context(100, 100));
    tool.onPointerMove(event, context(255, 255));
    expect(store.getState().polygons[0].vertices[0]).toEqual(
      position(260, 260),
    );
    expect(store.getState().apples[0].position).toEqual(position(280, 280));
    expect(store.getState().pictures[0]).toEqual({
      ...picture,
      position: position(290, 290),
    });
    tool.onPointerUp(event, context(255, 255));
  });

  it("does not snap a selection back to its own initial position", () => {
    const { store, tool, event, context } = setupGuidedDrag();
    tool.onPointerMove(event, context(104, 104));
    expect(store.getState().apples[0].position).toEqual(position(104, 104));
    tool.clear();
    const viewportRect = { minX: 0, minY: 0, maxX: 400, maxY: 400 };
    expect(
      tool
        .getWorldOverlays({ viewportRect })
        .some((o) => "color" in o && o.color === "#ed66d5"),
    ).toBe(false);
  });

  it("only considers visible targets from the drag-start viewport", () => {
    const { store, tool, event, context } = setupGuidedDrag();
    tool.onPointerUp(event, context(100, 100));
    tool.getWorldOverlays({
      viewportRect: { minX: 0, minY: 0, maxX: 150, maxY: 150 },
    });
    tool.onPointerDown(event, context(100, 100));
    tool.onPointerMove(event, context(196, 196));
    expect(store.getState().apples[0].position).toEqual(position(196, 196));
    tool.onPointerUp(event, context(196, 196));
  });

  it("defaults to off, persists independently and does not dirty the level or add history", () => {
    const preferences = loadEditorPreferences();
    expect(preferences.showSmartGuides).toBe(false);
    expect(preferences.snapToSmartGuides).toBe(false);
    const { store } = createTool();
    store.temporal.getState().clear();
    const dirty = store.getState().documentSession.dirty;
    store.getState().actions.toggleSmartGuides("showSmartGuides");
    store.getState().actions.toggleSmartGuides("snapToSmartGuides");
    expect(store.getState().documentSession.dirty).toBe(dirty);
    expect(store.temporal.getState().pastStates).toHaveLength(0);
    const restored = createEditorStore({
      initialPreferences: {
        ...preferences,
        showSmartGuides: true,
        snapToSmartGuides: true,
      },
    });
    expect(restored.getState().showSmartGuides).toBe(true);
    expect(restored.getState().snapToSmartGuides).toBe(true);
  });
});
