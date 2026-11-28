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
  store.getState().actions.registerTool(tool);
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
    store.history.clear();
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
    expect(store.history.state.getState().entries).toHaveLength(1);
    store.history.undo();
    expect(store.getState().apples[0].position).toEqual(position(100, 100));
  });

  it("gives grid snapping priority and bypasses both with Alt", () => {
    const { store, tool, event, context } = setupGuidedDrag();
    store.getState().actions.setGrid({ snap: true, size: 49 });

    tool.onPointerMove(event, context(197, 197));
    expect(store.getState().apples[0].position).toEqual(position(196, 196));

    tool.onPointerMove(
      { ...event, altKey: true } as PointerEvent,
      context(197, 197),
    );
    expect(store.getState().apples[0].position).toEqual(position(197, 197));
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
    store.history.clear();
    const dirty = store.getState().documentSession.dirty;
    store.getState().actions.toggleSmartGuides("showSmartGuides");
    store.getState().actions.toggleSmartGuides("snapToSmartGuides");
    expect(store.getState().documentSession.dirty).toBe(dirty);
    expect(store.history.state.getState().entries).toHaveLength(0);
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
