import { describe, expect, it } from "vitest";
import type { Polygon, Position } from "~/editor/elma-types";
import {
  defaultAutoGrassOptions,
  generateAutoGrassPolygons,
  getAutoGrassablePolygonsFromSelection,
} from "./auto-grass";
import {
  getGrassEdgeIndices,
  getGrassFillQuads,
} from "~/editor/render/world-geometry";
import { getSimpleGrassFillQuads } from "~/editor/render/webgl-geometry";

function position(x: number, y: number): Position {
  return { x, y } as Position;
}

const leftClearance = 1 / 48;
const rightClearance = 10 / 48;

function expectVertices(actual: Position[], expected: Position[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((vertex, index) => {
    expect(vertex.x).toBeCloseTo(expected[index]!.x, 10);
    expect(vertex.y).toBeCloseTo(expected[index]!.y, 10);
  });
}

function polygon(vertices: Position[], grass = false): Polygon {
  return { vertices, grass } as Polygon;
}

describe("generateAutoGrassPolygons", () => {
  it("generates grass on shallow edges with sky above and ground below", () => {
    const skyPocket = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 2),
      position(0, 2),
    ]);

    const generated = generateAutoGrassPolygons({
      polygons: [skyPocket],
      sourcePolygons: [skyPocket],
      options: { ...defaultAutoGrassOptions, endInset: 0 },
    });

    expect(generated).toHaveLength(1);
    expect(generated[0]?.grass).toBe(true);
    expect(generated[0]?.vertices[0]?.x).toBeCloseTo(10 - rightClearance);
    expect(generated[0]?.vertices[1]?.x).toBeCloseTo(leftClearance);
    expect(generated[0]?.vertices[0]?.y).toBeGreaterThan(2);
    expect(generated[0]?.vertices[1]?.y).toBeGreaterThan(2);
  });

  it.each([false, true])(
    "extends zero-inset grass to a thin outward tip (reversed: %s)",
    (reverse) => {
      const outer = polygon([
        position(-5, -5),
        position(25, -5),
        position(25, 10),
        position(-5, 10),
      ]);
      const vertices = [position(0, 0), position(20, 0), position(0, 0.6)];
      const ledge = polygon(reverse ? vertices.reverse() : vertices);
      const generated = generateAutoGrassPolygons({
        polygons: [outer, ledge],
        sourcePolygons: [ledge],
        options: { depth: 16 / 48, endInset: 0 },
      });
      expect(generated).toHaveLength(1);
      expect(Math.max(...generated[0]!.vertices.map((v) => v.x))).toBeCloseTo(
        20,
      );
    },
  );

  it("moves the visible grass edge away from the ground edge when depth changes", () => {
    const skyPocket = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 2),
      position(0, 2),
    ]);

    const shallow = generateAutoGrassPolygons({
      polygons: [skyPocket],
      sourcePolygons: [skyPocket],
      options: { ...defaultAutoGrassOptions, endInset: 0, depth: 0.1 },
    });
    const deep = generateAutoGrassPolygons({
      polygons: [skyPocket],
      sourcePolygons: [skyPocket],
      options: { ...defaultAutoGrassOptions, endInset: 0, depth: 0.5 },
    });

    expect(deep[0]!.vertices[0]!.y).toBeGreaterThan(shallow[0]!.vertices[0]!.y);
  });

  it("generates zero-inset flat grass with two distinct endpoints", () => {
    const skyPocket = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 2),
      position(0, 2),
    ]);

    const generated = generateAutoGrassPolygons({
      polygons: [skyPocket],
      sourcePolygons: [skyPocket],
      options: { ...defaultAutoGrassOptions, endInset: 0 },
    });

    expect(generated).toHaveLength(1);
    expectVertices(generated[0]!.vertices, [
      position(10 - rightClearance, 2 + defaultAutoGrassOptions.depth),
      position(leftClearance, 2 + defaultAutoGrassOptions.depth),
    ]);
  });

  it("renders generated flat grass as one strip without end caps", () => {
    const skyPocket = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 2),
      position(0, 2),
    ]);

    const generated = generateAutoGrassPolygons({
      polygons: [skyPocket],
      sourcePolygons: [skyPocket],
      options: { ...defaultAutoGrassOptions, endInset: 0 },
    });

    const quads = getGrassFillQuads({
      vertices: generated[0]!.vertices,
      zoom: 1,
      depth: defaultAutoGrassOptions.depth,
    });

    expect(quads).toHaveLength(1);
    const ends = [quads[0]![0].x, quads[0]![1].x].sort((a, b) => a - b);
    expect(ends[0]).toBeCloseTo(leftClearance);
    expect(ends[1]).toBeCloseTo(10 - rightClearance);
    expect(quads[0]?.[0].y).toBe(2 + defaultAutoGrassOptions.depth);
    expect(quads[0]?.[1].y).toBe(2 + defaultAutoGrassOptions.depth);
  });

  it("renders generated simple grass up from the line with the textured height", () => {
    const skyPocket = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 2),
      position(0, 2),
    ]);
    const depth = 1;

    const generated = generateAutoGrassPolygons({
      polygons: [skyPocket],
      sourcePolygons: [skyPocket],
      options: { ...defaultAutoGrassOptions, depth, endInset: 0 },
    });

    const quads = getSimpleGrassFillQuads({
      vertices: generated[0]!.vertices,
      grassEdgeIndices: [0],
      zoom: 1,
      depth,
    });

    expect(quads[0]?.[0].y).toBe(2 + depth);
    expect(quads[0]?.[3].y).toBeCloseTo(2 + depth - 39 / 48);
  });

  it("generates one grass polygon for adjacent grassable edges", () => {
    const skyPocket = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 2),
      position(5, 2),
      position(0, 2),
    ]);

    const generated = generateAutoGrassPolygons({
      polygons: [skyPocket],
      sourcePolygons: [skyPocket],
      options: { ...defaultAutoGrassOptions, endInset: 0 },
    });

    expect(generated).toHaveLength(1);
    expectVertices(generated[0]!.vertices, [
      position(10 - rightClearance, 2 + defaultAutoGrassOptions.depth),
      position(5, 2 + defaultAutoGrassOptions.depth),
      position(leftClearance, 2 + defaultAutoGrassOptions.depth),
    ]);
  });

  it("does not create gaps at internal vertices when end inset is enabled", () => {
    const skyPocket = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 2),
      position(5, 2),
      position(0, 2),
    ]);

    const generated = generateAutoGrassPolygons({
      polygons: [skyPocket],
      sourcePolygons: [skyPocket],
      options: defaultAutoGrassOptions,
    });

    expect(generated).toHaveLength(1);
    expectVertices(generated[0]!.vertices, [
      position(
        10 - Math.max(rightClearance, defaultAutoGrassOptions.endInset),
        2 + defaultAutoGrassOptions.depth,
      ),
      position(5, 2 + defaultAutoGrassOptions.depth),
      position(
        Math.max(leftClearance, defaultAutoGrassOptions.endInset),
        2 + defaultAutoGrassOptions.depth,
      ),
      position(
        Math.max(leftClearance, defaultAutoGrassOptions.endInset),
        2 + defaultAutoGrassOptions.depth,
      ),
    ]);
  });

  it("keeps inset flat caps abrupt with no source-line vertices", () => {
    const skyPocket = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 2),
      position(0, 2),
    ]);

    const generated = generateAutoGrassPolygons({
      polygons: [skyPocket],
      sourcePolygons: [skyPocket],
      options: { ...defaultAutoGrassOptions, endInset: 2 },
    });

    expect(generated).toHaveLength(1);
    expectVertices(generated[0]!.vertices, [
      position(8, 2 + defaultAutoGrassOptions.depth),
      position(2, 2 + defaultAutoGrassOptions.depth),
      position(2, 2 + defaultAutoGrassOptions.depth),
    ]);
  });

  it("keeps grass continuous across short shallow polygon segments", () => {
    const skyPocket = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 2),
      position(9.75, 2.02),
      position(9.5, 2.04),
      position(9.25, 2.06),
      position(9, 2.08),
      position(0, 2.08),
    ]);

    const generated = generateAutoGrassPolygons({
      polygons: [skyPocket],
      sourcePolygons: [skyPocket],
      options: defaultAutoGrassOptions,
    });

    expect(generated).toHaveLength(1);
    const vertices = generated[0]!.vertices;
    // The smaller clearance preserves every segment; inset is not added twice.
    expect(vertices).toHaveLength(7);
    expect(vertices[0]!.x).toBeLessThan(
      10 + defaultAutoGrassOptions.depth * (0.02 / Math.hypot(0.25, 0.02)),
    );
    expect(vertices[0]!.x).toBeGreaterThan(
      9.75 + defaultAutoGrassOptions.depth * (0.02 / Math.hypot(0.25, 0.02)),
    );
    const quads = getGrassFillQuads({
      vertices,
      zoom: 1,
      depth: defaultAutoGrassOptions.depth,
    });
    expect(quads).toHaveLength(5);
    expectVertices(
      [vertices[1]!],
      [
        position(
          9.75 +
            defaultAutoGrassOptions.depth * (0.02 / Math.hypot(0.25, 0.02)),
          2.02 +
            defaultAutoGrassOptions.depth * (0.25 / Math.hypot(0.25, 0.02)),
        ),
      ],
    );
  });

  it("keeps every shallow source segment grassed until a max-angle edge interrupts it", () => {
    const skyPocket = polygon([
      position(0, 0),
      position(12, 0),
      position(12, 2),
      position(9, 2.1),
      position(6, 2.2),
      position(3, 2.1),
      position(0, 2),
    ]);

    const generated = generateAutoGrassPolygons({
      polygons: [skyPocket],
      sourcePolygons: [skyPocket],
      options: { ...defaultAutoGrassOptions, endInset: 0 },
    });

    const quads = getGrassFillQuads({
      vertices: generated[0]!.vertices,
      zoom: 1,
      depth: defaultAutoGrassOptions.depth,
    });

    expect(generated).toHaveLength(1);
    expect(quads).toHaveLength(4);
    expect(
      Math.min(...quads.flatMap((quad) => [quad[0].x, quad[1].x])),
    ).toBeCloseTo(leftClearance);
    expect(
      Math.max(...quads.flatMap((quad) => [quad[0].x, quad[1].x])),
    ).toBeCloseTo(12 - rightClearance);
  });

  it("continues grass from a flat edge onto a shallow incoming edge", () => {
    const skyPocket = polygon([
      position(0, 0),
      position(12, 0),
      position(12, 2),
      position(4, 2),
      position(0, 0.8),
    ]);

    const generated = generateAutoGrassPolygons({
      polygons: [skyPocket],
      sourcePolygons: [skyPocket],
      options: { ...defaultAutoGrassOptions, endInset: 0 },
    });

    const quads = getGrassFillQuads({
      vertices: generated[0]!.vertices,
      zoom: 1,
      depth: defaultAutoGrassOptions.depth,
    });

    expect(generated).toHaveLength(1);
    expect(quads).toHaveLength(2);
    expect(
      Math.min(...quads.flatMap((quad) => [quad[0].x, quad[1].x])),
    ).toBeCloseTo(leftClearance);
  });

  it("generates grass on slopes represented by the steepest grass sprite", () => {
    const skyPocket = polygon([
      position(0, 0),
      position(12, 0),
      position(12, 8),
      position(4, 8),
      position(0, 1.6),
    ]);

    const generated = generateAutoGrassPolygons({
      polygons: [skyPocket],
      sourcePolygons: [skyPocket],
      options: { ...defaultAutoGrassOptions, endInset: 0 },
    });

    const quads = getGrassFillQuads({
      vertices: generated[0]!.vertices,
      zoom: 1,
      depth: defaultAutoGrassOptions.depth,
    });

    expect(generated).toHaveLength(1);
    expect(quads).toHaveLength(2);
    expect(
      Math.min(...quads.flatMap((quad) => [quad[0].x, quad[1].x])),
    ).toBeCloseTo(leftClearance);
  });

  it("offsets sloped grass by the configured depth perpendicular to the ground edge", () => {
    const skyPocket = polygon([
      position(0, 0),
      position(12, 0),
      position(12, 8),
      position(4, 8),
      position(0, 1.6),
    ]);
    const depth = 1;

    const generated = generateAutoGrassPolygons({
      polygons: [skyPocket],
      sourcePolygons: [skyPocket],
      options: { ...defaultAutoGrassOptions, depth, endInset: 0 },
    });

    expect(generated).toHaveLength(1);
    const slopeLength = Math.hypot(4, 6.4);
    expect(generated[0]!.vertices[2]!.x).toBeCloseTo(
      0 - (6.4 / slopeLength) * depth,
    );
    expect(generated[0]!.vertices[2]!.y).toBeCloseTo(
      1.6 + (4 / slopeLength) * depth,
    );
  });

  it("grasses clear spans when only part of a source edge is blocked", () => {
    const skyPocket = polygon([
      position(0, 0),
      position(20, 0),
      position(20, 2),
      position(0, 2),
    ]);
    const groundIsland = polygon([
      position(8, 1.5),
      position(12, 1.5),
      position(12, 1.95),
      position(8, 1.95),
    ]);

    const generated = generateAutoGrassPolygons({
      polygons: [skyPocket, groundIsland],
      sourcePolygons: [skyPocket],
      options: { ...defaultAutoGrassOptions, endInset: 0 },
    });

    expect(generated).toHaveLength(2);
    expect(generated.map((grass) => grass.vertices.length)).toEqual([2, 2]);
    expect(generated.map((grass) => grass.vertices[0]!.x)).toEqual([
      expect.closeTo(20 - rightClearance),
      expect.closeTo(8),
    ]);
    expect(generated.map((grass) => grass.vertices[1]!.x)).toEqual([
      expect.closeTo(12),
      expect.closeTo(leftClearance),
    ]);
  });

  it("splits grass polygons when an ungrassable edge interrupts the run", () => {
    const skyPocket = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 2),
      position(6, 2),
      position(5, 8),
      position(4, 2),
      position(0, 2),
    ]);

    const generated = generateAutoGrassPolygons({
      polygons: [skyPocket],
      sourcePolygons: [skyPocket],
      options: { ...defaultAutoGrassOptions, endInset: 0 },
    });

    expect(generated).toHaveLength(2);
    expect(generated.map((grass) => grass.vertices.length)).toEqual([2, 2]);
  });

  it.each([false, true])(
    "clears sloped endpoints regardless of winding (reversed: %s)",
    (reverse) => {
      const vertices = [
        position(0, 0),
        position(10, 0),
        position(10, 8),
        position(0, 2),
      ];
      const source = polygon(reverse ? vertices.reverse() : vertices);
      const generated = generateAutoGrassPolygons({
        polygons: [source],
        sourcePolygons: [source],
        options: { depth: 16 / 48, endInset: 0 },
      });
      expect(generated).toHaveLength(1);
      const ends = generated[0]!.vertices.slice(0, 2).sort((a, b) => a.x - b.x);
      expect(ends[0]!.x).toBeCloseTo(leftClearance);
      expect(ends[1]!.x).toBeCloseTo(10 - rightClearance);
      // The safe endpoints stay on the same parallel offset of the floor.
      expect(ends[1]!.y - ends[0]!.y).toBeCloseTo(
        (ends[1]!.x - ends[0]!.x) * 0.6,
      );
    },
  );

  it("backs away from an inward wall at an acute corner", () => {
    const source = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 4),
      position(0, 4),
      position(2, 2),
    ]);
    const generated = generateAutoGrassPolygons({
      polygons: [source],
      sourcePolygons: [source],
      options: { depth: 16 / 48, endInset: 0 },
    });
    const floor = generated.find((grass) =>
      grass.vertices.every((vertex) => vertex.y > 4),
    )!;
    // The wall reaches x=0.5 at the top of the visible grass band.
    expect(Math.min(...floor.vertices.map((vertex) => vertex.x))).toBeCloseTo(
      0.5 + leftClearance,
    );
  });

  it.each([0.5, 2])(
    "keeps a floor continuous under a separate roof at height %s",
    (roofHeight) => {
      const source = polygon([
        position(0, 0),
        position(10, 0),
        position(10, 4),
        position(0, 4),
      ]);
      const roof = polygon([
        position(2, 4 - roofHeight - 0.1),
        position(6, 4 - roofHeight - 0.1),
        position(6, 4 - roofHeight),
        position(2, 4 - roofHeight),
      ]);
      const generated = generateAutoGrassPolygons({
        polygons: [source, roof],
        sourcePolygons: [source],
        options: { depth: 16 / 48, endInset: 0 },
      });
      expect(generated).toHaveLength(1);
      expectVertices(generated[0]!.vertices, [
        position(10 - rightClearance, 4 + 16 / 48),
        position(leftClearance, 4 + 16 / 48),
      ]);
    },
  );

  it("omits runs consumed by the user's inset", () => {
    const source = polygon([
      position(0, 0),
      position(2, 0),
      position(2, 4),
      position(0, 4),
    ]);
    expect(
      generateAutoGrassPolygons({
        polygons: [source],
        sourcePolygons: [source],
        options: { depth: 16 / 48, endInset: 2 },
      }),
    ).toEqual([]);
  });

  it("does not generate grass on steep wall edges", () => {
    const verticalSlot = polygon([
      position(0, 0),
      position(2, 0),
      position(2, 10),
      position(0, 10),
    ]);

    const generated = generateAutoGrassPolygons({
      polygons: [verticalSlot],
      sourcePolygons: [verticalSlot],
      options: defaultAutoGrassOptions,
    });

    expect(generated).toHaveLength(1);
    expect(generated[0]?.vertices[0]?.y).toBeGreaterThan(10);
  });
});

describe("getAutoGrassablePolygonsFromSelection", () => {
  it("returns only fully selected non-grass polygons", () => {
    const ground = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 2),
      position(0, 2),
    ]);
    const grass = polygon(
      [position(0, 3), position(10, 3), position(10, 4), position(0, 4)],
      true,
    );

    const selected = getAutoGrassablePolygonsFromSelection([
      ...ground.vertices.map((vertex) => ({ polygon: ground, vertex })),
      ...grass.vertices.map((vertex) => ({ polygon: grass, vertex })),
    ]);

    expect(selected).toEqual([ground]);
  });

  it("does not treat partial vertex selection as a selected polygon", () => {
    const ground = polygon([
      position(0, 0),
      position(10, 0),
      position(10, 2),
      position(0, 2),
    ]);

    const selected = getAutoGrassablePolygonsFromSelection([
      { polygon: ground, vertex: ground.vertices[0]! },
      { polygon: ground, vertex: ground.vertices[1]! },
    ]);

    expect(selected).toEqual([]);
  });
});

describe("getGrassEdgeIndices", () => {
  it("keeps manual grass band end edges paintable for simple-color grass", () => {
    const vertices = [
      position(0, 0),
      position(10, 0),
      position(10, 2),
      position(0, 2),
    ];

    expect(getGrassEdgeIndices(vertices)).toEqual([1, 2, 3]);
  });
});
