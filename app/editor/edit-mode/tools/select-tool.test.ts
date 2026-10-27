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
