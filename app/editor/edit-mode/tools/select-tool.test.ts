import {
  defaultPictureSelectionSettings,
  getPictureSelectionSegments,
  isPictureSelectionHit,
} from "~/editor/helpers/picture-selection";
import type { LgrAssets } from "~/components/lgr-assets";
import { PICTURE_SCALE } from "~/editor/render/picture-metrics";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "~/editor/editor-store";
import { Clip, Gravity, type Position } from "~/editor/elma-types";
import { defaultTools } from "./default-tools";
import { SelectTool, type SelectToolState } from "./select-tool";
import { getKuskiSelectionCircles } from "~/editor/kuski-geometry";
import { TextTool, type TextToolState } from "./text-tool";
import { defaultTextOptions } from "~/editor/helpers/text-polygons";

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

function modifierClick(tool: SelectTool, worldPos: Position) {
  return tool.onPointerDown(
    {
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    } as PointerEvent,
    { worldPos, screenX: 0, screenY: 0 },
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

describe("TextTool completion", () => {
  it("selects created polygons with the regular Select tool", () => {
    const store = createEditorStore({ initialToolId: defaultTools.text.id });
    const selectTool = new SelectTool(store);
    const textTool = new TextTool(store);
    const polygon = {
      grass: false,
      vertices: [position(0, 0), position(10, 0), position(0, 10)],
    };
    store.getState().actions.registerTool(selectTool);
    store.getState().actions.registerTool(textTool);
    store.getState().actions.setToolState<TextToolState>(defaultTools.text.id, {
      options: { ...defaultTextOptions, text: "A" },
      status: "ready",
      vertexCount: polygon.vertices.length,
      draft: { position: position(20, 30) },
    });
    Object.assign(textTool, { polygons: [polygon] });

    textTool.commit();

    const placed = store.getState().polygons[0];
    const selection = getSelection(store);
    expect(store.getState().activeToolId).toBe(defaultTools.select.id);
    expect(placed.vertices).toEqual([
      position(20, 30),
      position(30, 30),
      position(20, 40),
    ]);
    expect(selection?.selectedVertices).toEqual(
      placed.vertices.map((vertex) => ({ polygon: placed, vertex })),
    );
    expect(selection?.transformMode).toBe(false);
  });
});

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
      store.history.clear();

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
      expect(store.history.state.getState().entries).toHaveLength(1);

      tool.mirrorSelection(direction);
      expect(store.getState().polygons[0]).toEqual(polygon);
      expect(store.getState().apples[0].position).toEqual(firstApple);
      store.history.undo();
      expect(store.getState().apples[0].position).toEqual(
        reflected(firstApple),
      );
      store.history.undo();
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

describe("SelectTool modifier-click selection", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      navigator: { platform: "MacIntel" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes a selected object without starting a drag", () => {
    const { store, tool, firstApple, secondApple } = createTool();
    store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedObjects: [firstApple, secondApple],
      });

    expect(modifierClick(tool, firstApple)).toBe(true);

    expect(getSelection(store)?.selectedObjects).toEqual([secondApple]);
    expect(getSelection(store)?.isDragging).toBe(false);
  });

  it("removes selected vertices, polygons, and pictures", () => {
    const polygon = {
      grass: false,
      vertices: [position(300, 300), position(400, 300), position(300, 400)],
    };

    const vertexCase = createTool();
    vertexCase.store.getState().actions.setPolygons([polygon]);
    vertexCase.store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedVertices: polygon.vertices.map((vertex) => ({
          polygon,
          vertex,
        })),
      });
    modifierClick(vertexCase.tool, polygon.vertices[0]);
    expect(getSelection(vertexCase.store)?.selectedVertices).toEqual(
      polygon.vertices.slice(1).map((vertex) => ({ polygon, vertex })),
    );

    const polygonCase = createTool();
    polygonCase.store.getState().actions.setPolygons([polygon]);
    polygonCase.store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedVertices: polygon.vertices.map((vertex) => ({
          polygon,
          vertex,
        })),
      });
    modifierClick(polygonCase.tool, position(350, 300));
    expect(getSelection(polygonCase.store)?.selectedVertices).toEqual([]);

    const pictureCase = createTool();
    const picturePosition = position(10, 10);
    pictureCase.store.getState().actions.setPictures([
      {
        name: "picture",
        texture: "",
        mask: "",
        position: picturePosition,
        distance: 100,
        clip: Clip.Unclipped,
      },
    ]);
    pictureCase.store
      .getState()
      .actions.setToolState<SelectToolState>(defaultTools.select.id, {
        selectedPictures: [picturePosition],
        hoveredPictureBounds: {
          position: picturePosition,
          width: 10,
          height: 10,
          distance: 100,
        },
      });
    modifierClick(pictureCase.tool, picturePosition);
    expect(getSelection(pictureCase.store)?.selectedPictures).toEqual([]);
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

describe("Picture selection preferences", () => {
  const picture = {
    name: "test",
    texture: "",
    mask: "" as const,
    clip: Clip.Unclipped,
    distance: 500,
    position: position(0, 0),
  };
  function assets() {
    const pixels = new Uint8ClampedArray(10 * 10 * 4);
    for (let y = 3; y < 7; y++)
      for (let x = 3; x < 7; x++) pixels[(y * 10 + x) * 4 + 3] = 255;
    return {
      getSprite: () => ({ width: 10, height: 10 }),
      getSpritePixels: () => ({ width: 10, height: 10, pixels }),
    } as unknown as LgrAssets;
  }
  it("distinguishes image rectangles, visible outlines, interiors and borders", () => {
    const lgr = assets();
    const point = (x: number, y: number) =>
      position(x * PICTURE_SCALE, y * PICTURE_SCALE);
    const tolerance = PICTURE_SCALE / 4;
    expect(
      isPictureSelectionHit(
        point(1, 1),
        picture,
        lgr,
        defaultPictureSelectionSettings,
        tolerance,
      ),
    ).toBe(false);
    expect(
      isPictureSelectionHit(
        point(1, 1),
        picture,
        lgr,
        { ...defaultPictureSelectionSettings, boundary: "rectangle" },
        tolerance,
      ),
    ).toBe(true);
    expect(
      isPictureSelectionHit(
        point(5, 5),
        picture,
        lgr,
        defaultPictureSelectionSettings,
        tolerance,
      ),
    ).toBe(true);
    expect(
      isPictureSelectionHit(
        point(5, 5),
        picture,
        lgr,
        { ...defaultPictureSelectionSettings, click: "border" },
        tolerance,
      ),
    ).toBe(false);
    expect(
      isPictureSelectionHit(
        point(3, 5),
        picture,
        lgr,
        { ...defaultPictureSelectionSettings, click: "border" },
        tolerance,
      ),
    ).toBe(true);
    expect(
      isPictureSelectionHit(
        point(10.1, 5),
        picture,
        lgr,
        {
          ...defaultPictureSelectionSettings,
          boundary: "rectangle",
          click: "border",
        },
        tolerance,
      ),
    ).toBe(true);
    expect(getPictureSelectionSegments(picture, lgr, "rectangle")).toHaveLength(
      4,
    );
  });
  it("keeps the top-left anchor clickable in every click mode", () => {
    for (const click of ["interior", "border", "anchor"] as const) {
      expect(
        isPictureSelectionHit(
          position(0, 0),
          picture,
          assets(),
          { ...defaultPictureSelectionSettings, click },
          0.001,
        ),
      ).toBe(true);
    }
    expect(
      isPictureSelectionHit(
        position(PICTURE_SCALE * 5, PICTURE_SCALE * 5),
        picture,
        assets(),
        { ...defaultPictureSelectionSettings, click: "anchor" },
        0.001,
      ),
    ).toBe(false);
  });
  it("can use the anchor rather than the full picture bounds for area selection", () => {
    vi.stubGlobal("window", { navigator: { platform: "Linux" } });
    try {
      const { store, tool } = createTool();
      const picturePosition = position(10, 10);
      store
        .getState()
        .actions.setPictures([{ ...picture, position: picturePosition }]);
      store.getState().actions.setPictureSelection({ area: "anchor" });
      tool.setPictureDimensionsResolver(() => ({ width: 10, height: 10 }));
      dragMarquee(tool, position(14, 14), position(20, 20));
      expect(getSelection(store)?.selectedPictures).toEqual([]);
      dragMarquee(tool, position(9, 9), position(11, 11));
      expect(getSelection(store)?.selectedPictures).toEqual([picturePosition]);
    } finally {
      vi.unstubAllGlobals();
    }
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

describe("Transactional editor history", () => {
  beforeEach(() =>
    vi.stubGlobal("window", { navigator: { platform: "Linux" } }),
  );
  afterEach(() => vi.unstubAllGlobals());

  function historyTool() {
    const context = createTool();
    context.store.getState().actions.registerTool(context.tool);
    context.store.history.clear();
    context.store.getState().actions.markDocumentSaved();
    return context;
  }
  const event = {
    button: 0,
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
  } as PointerEvent;
  const at = (worldPos: Position) => ({
    worldPos,
    screenX: worldPos.x,
    screenY: worldPos.y,
  });
  function startMove(context: ReturnType<typeof historyTool>) {
    context.tool.onPointerDown(event, at(context.firstApple));
    context.tool.onPointerMove(event, at(position(110, 120)));
  }

  it("records one complete drag and restores selected original identities on undo and redo", () => {
    const context = historyTool();
    const { store, tool, firstApple } = context;
    startMove(context);
    for (let x = 111; x <= 130; x++)
      tool.onPointerMove(event, at(position(x, 120)));
    expect(store.history.state.getState().entries).toHaveLength(0);
    tool.onPointerUp(event, at(position(130, 120)));
    expect(
      store.history.state.getState().entries.map((entry) => entry.label),
    ).toEqual(["Move selection"]);
    const moved = store.getState().apples[0].position;
    expect(moved).toEqual(position(130, 120));
    expect(store.getState().documentSession.dirty).toBe(true);
    store.history.undo();
    expect(store.getState().apples[0].position).toBe(firstApple);
    expect(getSelection(store)?.selectedObjects).toEqual([firstApple]);
    expect(store.getState().documentSession.dirty).toBe(false);
    store.history.redo();
    expect(store.getState().apples[0].position).toBe(moved);
    expect(getSelection(store)?.selectedObjects[0]).toBe(moved);
    expect(store.getState().documentSession.dirty).toBe(true);
  });

  it.each(["pointercancel", "Escape", "cancelInteraction", "undo"])(
    "rolls back an active move on %s without consuming the previous edit",
    (reason) => {
      const context = historyTool();
      const { store, tool, firstApple } = context;
      store.getState().actions.setGround("new-ground");
      startMove(context);
      if (reason === "pointercancel")
        tool.onPointerUp(
          { ...event, type: "pointercancel" } as PointerEvent,
          at(position(110, 120)),
        );
      else if (reason === "Escape")
        tool.onKeyDown(
          { key: "Escape", preventDefault() {} } as KeyboardEvent,
          at(firstApple),
        );
      else if (reason === "undo") store.history.undo();
      else tool.cancelInteraction();
      expect(store.getState().apples[0].position).toBe(firstApple);
      expect(getSelection(store)?.selectedObjects[0]).toBe(firstApple);
      expect(store.getState().ground).toBe("new-ground");
      expect(store.history.state.getState().cursor).toBe(1);
      expect(store.history.state.getState().active).toBeNull();
      store.history.undo();
      expect(store.getState().ground).toBe("ground");
    },
  );

  it("uses each edit's starting selection rather than the previous edit's final selection", () => {
    const { store, firstApple, secondApple } = historyTool();
    store.getState().actions.setToolState<SelectToolState>("select", {
      selectedObjects: [firstApple],
    });
    store.getState().actions.setGround("different");
    store.getState().actions.setToolState<SelectToolState>("select", {
      selectedObjects: [secondApple],
    });
    store.getState().actions.setSky("different-sky");
    store.history.undo();
    expect(getSelection(store)?.selectedObjects).toEqual([secondApple]);
    store.history.undo();
    expect(getSelection(store)?.selectedObjects).toEqual([firstApple]);
  });

  it("keeps redo after selection changes, unchanged edits, and drags returning to their origin", () => {
    const context = historyTool();
    const { store, tool, firstApple } = context;
    store.getState().actions.setGround("different");
    store.history.undo();
    store.getState().actions.setToolState<SelectToolState>("select", {
      selectedObjects: [firstApple],
    });
    store.getState().actions.setGround("ground");
    startMove(context);
    tool.onPointerUp(event, at(firstApple));
    expect(store.history.state.getState().entries).toHaveLength(1);
    expect(store.history.state.getState().cursor).toBe(0);
    expect(store.history.state.getState().canRedo).toBe(true);
    store.history.redo();
    expect(store.getState().ground).toBe("different");
  });

  it("groups nested domain actions and rolls a failed compound edit back atomically", () => {
    const { store } = historyTool();
    store.history.execute({ label: "Change textures" }, () => {
      store.getState().actions.setGround("new-ground");
      store.history.execute({ label: "Nested edit" }, () =>
        store.getState().actions.setSky("new-sky"),
      );
    });
    expect(store.history.state.getState().entries).toHaveLength(1);
    expect(() =>
      store.history.execute({ label: "Fail" }, () => {
        store.getState().actions.setGround("bad-ground");
        store.getState().actions.setSky("bad-sky");
        throw new Error("failed");
      }),
    ).toThrow("failed");
    expect(store.getState().ground).toBe("new-ground");
    expect(store.getState().sky).toBe("new-sky");
    expect(store.history.state.getState().active).toBeNull();
    expect(store.history.state.getState().entries).toHaveLength(1);
    store.history.undo();
    expect(store.getState().ground).toBe("ground");
    expect(store.getState().sky).toBe("sky");
  });

  it("travels both ways through the timeline and replaces only the future branch on a new edit", () => {
    const { store } = historyTool();
    store.getState().actions.setGround("one");
    store.getState().actions.setGround("two");
    store.getState().actions.setGround("three");
    const [one, two, three] = store.history.state.getState().entries;
    store.history.goTo(one.id);
    expect(store.getState().ground).toBe("one");
    store.history.goTo(three.id);
    expect(store.getState().ground).toBe("three");
    store.history.goTo(null);
    expect(store.getState().ground).toBe("ground");
    store.history.goTo(two.id);
    store.getState().actions.setGround("replacement");
    expect(
      store.history.state
        .getState()
        .entries.map((entry) => entry.id)
        .slice(0, 2),
    ).toEqual([one.id, two.id]);
    expect(store.history.state.getState().canRedo).toBe(false);
    store.history.goTo(three.id);
    expect(store.getState().ground).toBe("replacement");
  });

  it("retains an undoable base when bounded history trims old entries", () => {
    const store = createEditorStore({ historyLimit: 2 });
    store.getState().actions.setGround("one");
    store.getState().actions.setGround("two");
    store.getState().actions.setGround("three");
    expect(store.history.state.getState().entries).toHaveLength(2);
    store.history.goTo(null);
    expect(store.getState().ground).toBe("one");
    expect(store.history.state.getState().canUndo).toBe(false);
    store.history.redo();
    expect(store.getState().ground).toBe("two");
  });

  it("restores the exact overlapping vertices and pictures without coordinate matching", () => {
    const { store, tool } = historyTool();
    const polygons = [0, 1].map(() => ({
      grass: false,
      vertices: [position(10, 10), position(30, 10), position(10, 30)],
    }));
    const pictures = ["one", "two"].map((name) => ({
      name,
      texture: "",
      mask: "" as const,
      clip: Clip.Unclipped,
      distance: 500,
      position: position(50, 50),
    }));
    store.getState().actions.setPolygons(polygons);
    store.getState().actions.setPictures(pictures);
    store.getState().actions.setToolState<SelectToolState>("select", {
      selectedVertices: [
        { polygon: polygons[1], vertex: polygons[1].vertices[0] },
      ],
      selectedPictures: [pictures[1].position],
    });
    store.history.clear();
    store.getState().actions.setGround("different");
    store.history.undo();
    tool.getWorldOverlays({
      viewportRect: { minX: 0, minY: 0, maxX: 500, maxY: 500 },
    });
    expect(getSelection(store)?.selectedVertices[0].polygon).toBe(polygons[1]);
    expect(getSelection(store)?.selectedPictures[0]).toBe(pictures[1].position);
    store.history.redo();
    expect(getSelection(store)?.selectedVertices[0].vertex).toBe(
      polygons[1].vertices[0],
    );
    expect(getSelection(store)?.selectedPictures[0]).toBe(pictures[1].position);
  });

  it("records paste/duplicate and delete with their completed selection", () => {
    const { store, tool, firstApple } = historyTool();
    store.getState().actions.setToolState<SelectToolState>("select", {
      selectedObjects: [firstApple],
    });
    expect(tool.duplicateSelectionWithOffset()).toBe(true);
    const duplicate = getSelection(store)?.selectedObjects[0];
    expect(duplicate).not.toBe(firstApple);
    store.history.undo();
    expect(store.getState().apples).toHaveLength(2);
    expect(getSelection(store)?.selectedObjects).toEqual([firstApple]);
    store.history.redo();
    expect(getSelection(store)?.selectedObjects).toEqual([duplicate]);
    tool.deleteCurrentSelection();
    expect(getSelection(store)?.selectedObjects).toHaveLength(0);
    store.history.undo();
    expect(getSelection(store)?.selectedObjects[0]).toBe(duplicate);
    store.history.redo();
    expect(store.getState().apples).toHaveLength(2);
    expect(getSelection(store)?.selectedObjects).toHaveLength(0);
  });

  it("keeps reference-image bitmaps alive through removal and undo, then releases discarded resources", () => {
    const { store } = historyTool();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const image = {
      id: "reference",
      name: "reference.png",
      bitmap,
      position: position(20, 30),
      width: 100,
      height: 60,
      rotation: 0,
    };
    store.getState().actions.addReferenceImage(image);
    store
      .getState()
      .actions.updateReferenceImage(image.id, { width: 150, rotation: 0.5 });
    expect(store.getState().documentSession.dirty).toBe(false);
    store.getState().actions.removeReferenceImage(image.id);
    expect(bitmap.close).not.toHaveBeenCalled();
    store.history.undo();
    expect(store.getState().referenceImages[0].width).toBe(150);
    store.history.undo();
    expect(store.getState().referenceImages[0]).toBe(image);
    store.history.undo();
    expect(store.getState().referenceImages).toHaveLength(0);
    store.getState().actions.setGround("new branch");
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("undoes mixed session and level moves as one action", () => {
    const { store, tool, firstApple } = historyTool();
    store.getState().actions.addTestStart(position(80, 100));
    const testStart = store.getState().testStarts.items[0];
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    store.getState().actions.addReferenceImage({
      id: "image",
      name: "image",
      bitmap,
      position: position(300, 300),
      width: 20,
      height: 20,
      rotation: 0,
    });
    const reference = store.getState().referenceImages[0];
    store.getState().actions.setToolState<SelectToolState>("select", {
      selectedObjects: [firstApple, testStart.position, reference.position],
    });
    store.history.clear();
    tool.mirrorSelection("horizontal");
    expect(store.history.state.getState().entries).toHaveLength(1);
    store.history.undo();
    expect(store.getState().apples[0].position).toBe(firstApple);
    expect(store.getState().testStarts.items[0]).toBe(testStart);
    expect(store.getState().referenceImages[0]).toBe(reference);
    expect(getSelection(store)?.selectedObjects).toEqual([
      firstApple,
      testStart.position,
      reference.position,
    ]);
  });

  it("resets history, selection, and active edits when replacing the document", () => {
    const context = historyTool();
    const { store } = context;
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    store.getState().actions.addReferenceImage({
      id: "old-image",
      name: "old",
      bitmap,
      position: position(300, 300),
      width: 20,
      height: 20,
      rotation: 0,
    });
    startMove(context);
    store.getState().actions.replaceDocument({
      level: {
        levelName: "New",
        ground: "ground",
        sky: "sky",
        lgr: "default",
        polygons: [],
        apples: [],
        killers: [],
        flowers: [],
        pictures: [],
        start: position(0, 0),
      },
      origin: { kind: "default", label: "New", canOverwrite: false },
    });
    store.history.undo();
    expect(store.getState().levelName).toBe("New");
    expect(store.getState().apples).toHaveLength(0);
    expect(store.history.state.getState().entries).toHaveLength(0);
    expect(store.history.state.getState().active).toBeNull();
    expect(getSelection(store)?.selectedObjects).toHaveLength(0);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("ignores stale transaction completion after cancellation", () => {
    const { store } = historyTool();
    const edit = store.history.begin({ label: "Edit" });
    edit.update(() => store.getState().actions.setGround("changed"));
    edit.cancel();
    store.getState().actions.setSky("new-sky");
    edit.commit();
    edit.cancel();
    expect(() =>
      edit.update(() => store.getState().actions.setGround("bad")),
    ).toThrow("already ended");
    expect(store.getState().ground).toBe("ground");
    expect(store.getState().sky).toBe("new-sky");
    expect(store.history.state.getState().entries).toHaveLength(1);
  });
});

describe("History transaction edge cases", () => {
  beforeEach(() =>
    vi.stubGlobal("window", { navigator: { platform: "Linux" } }),
  );
  afterEach(() => vi.unstubAllGlobals());

  it("commits resize as one action and cancels a subsequent transform without losing selection", () => {
    const { store, tool } = createTool();
    store.getState().actions.registerTool(tool);
    const polygon = {
      grass: false,
      vertices: [
        position(40, 40),
        position(80, 40),
        position(80, 80),
        position(40, 80),
      ],
    };
    store.getState().actions.setPolygons([polygon]);
    store.getState().actions.setToolState<SelectToolState>("select", {
      selectedVertices: polygon.vertices.map((vertex) => ({ polygon, vertex })),
    });
    store.history.clear();
    const event = {
      button: 0,
      altKey: false,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
    } as PointerEvent;
    const at = (x: number, y: number) => ({
      worldPos: position(x, y),
      screenX: x,
      screenY: y,
    });
    tool.toggleTransform();
    tool.onPointerDown(event, at(80, 80));
    tool.onPointerMove(event, at(100, 100));
    expect(store.history.state.getState().entries).toHaveLength(0);
    tool.onPointerUp(event, at(100, 100));
    const resized = store.getState().polygons[0];
    expect(resized).not.toEqual(polygon);
    expect(store.history.state.getState().entries[0].label).toBe(
      "Resize selection",
    );
    tool.onPointerDown(event, at(100, 100));
    tool.onPointerMove(event, at(120, 120));
    tool.onPointerUp(
      { ...event, type: "pointercancel" } as PointerEvent,
      at(120, 120),
    );
    expect(store.getState().polygons[0]).toBe(resized);
    expect(getSelection(store)?.selectedVertices).toHaveLength(4);
    store.history.undo();
    expect(store.getState().polygons[0]).toBe(polygon);
    expect(getSelection(store)?.selectedVertices[0].polygon).toBe(polygon);
    store.history.redo();
    expect(getSelection(store)?.selectedVertices[0].polygon).toBe(resized);
  });

  it("captures selection against the replacement polygon when only its properties change", () => {
    const { store } = createTool();
    const polygon = {
      grass: false,
      vertices: [position(10, 10), position(30, 10), position(10, 30)],
    };
    store.getState().actions.setPolygons([polygon]);
    store.getState().actions.setToolState<SelectToolState>("select", {
      selectedVertices: [{ polygon, vertex: polygon.vertices[1] }],
    });
    store.history.clear();
    const replacement = { ...polygon, grass: true };
    store.getState().actions.setPolygons([replacement]);
    store.history.undo();
    expect(getSelection(store)?.selectedVertices[0].polygon).toBe(polygon);
    store.history.redo();
    expect(getSelection(store)?.selectedVertices[0].polygon).toBe(replacement);
    expect(getSelection(store)?.selectedVertices[0].vertex).toBe(
      polygon.vertices[1],
    );
  });

  it("does not restore deleted objects as selected on redo", () => {
    const { store, firstApple } = createTool();
    store.getState().actions.setToolState<SelectToolState>("select", {
      selectedObjects: [firstApple],
    });
    store.history.clear();
    store.getState().actions.removeApple(store.getState().apples[0]);
    store.history.undo();
    expect(getSelection(store)?.selectedObjects).toEqual([firstApple]);
    store.history.redo();
    expect(getSelection(store)?.selectedObjects).toHaveLength(0);
  });

  it("releases newly imported resources when a compound edit fails", () => {
    const store = createEditorStore();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    expect(() =>
      store.history.execute({ label: "Fail import" }, () => {
        store.getState().actions.addReferenceImage({
          id: "image",
          name: "image",
          bitmap,
          position: position(0, 0),
          width: 20,
          height: 20,
          rotation: 0,
        });
        throw new Error("failed");
      }),
    ).toThrow("failed");
    expect(store.getState().referenceImages).toHaveLength(0);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(store.history.state.getState().entries).toHaveLength(0);
  });

  it("rejects asynchronous transaction bodies before they can commit a partial action", () => {
    const store = createEditorStore();
    expect(() =>
      store.history.execute({ label: "Async" }, () => {
        store.getState().actions.setGround("partial");
        return Promise.resolve();
      }),
    ).toThrow("must be synchronous");
    expect(store.getState().ground).toBe("ground");
    expect(store.history.state.getState().entries).toHaveLength(0);
    const edit = store.history.begin({ label: "Outer" });
    expect(() =>
      store.history.execute({ label: "Async child" }, () => Promise.resolve()),
    ).toThrow("must be synchronous");
    expect(edit.active).toBe(false);
  });

  it("leaves view preferences and file-save metadata outside timeline restores", () => {
    const store = createEditorStore();
    store.getState().actions.setGround("edited");
    store.getState().actions.markDocumentSaved({ displayName: "saved.lev" });
    store.getState().actions.setZoom(3);
    store.getState().actions.setCamera(42, 27);
    store.getState().actions.setGrid({ snap: true });
    store.history.undo();
    expect(store.getState().documentSession.displayName).toBe("saved.lev");
    expect(store.getState().documentSession.dirty).toBe(true);
    expect(store.getState().zoom).toBe(3);
    expect(store.getState().viewPortOffset).toEqual({ x: 42, y: 27 });
    expect(store.getState().grid.snap).toBe(true);
    store.history.redo();
    expect(store.getState().documentSession.dirty).toBe(false);
  });
});
