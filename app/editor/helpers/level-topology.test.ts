import { describe, expect, it } from "vitest";
import type { Polygon } from "../elma-types";
import { validateLevelTopology } from "./level-topology";

const boundary: Polygon = {
  grass: false,
  vertices: [
    { x: -10, y: -10 },
    { x: 10, y: -10 },
    { x: 10, y: 10 },
    { x: -10, y: 10 },
  ],
};
const level = {
  polygons: [boundary],
  start: { x: 0, y: 0 },
  flowers: [{ x: 3, y: 3 }],
};
const assets = {
  levelName: "default",
  isReady: () => true,
  getSprite: () => true,
};
const placementChecks = ["object-inside-ground", "start-head", "start-wheel"];
const checksFor = (input: Parameters<typeof validateLevelTopology>[0]) =>
  Object.fromEntries(
    validateLevelTopology(input, assets).checks.map((check) => [
      check.id,
      check,
    ]),
  );

describe("incomplete topology checks", () => {
  it("keeps three checks blocked by the same malformed polygon out of the findings", () => {
    const malformed = { grass: false, vertices: [{ x: 1, y: 1 }] };
    const checks = checksFor({ ...level, polygons: [boundary, malformed] });

    expect(
      Object.values(checks)
        .filter(({ status }) => status !== "passed")
        .map(({ id }) => id),
    ).toEqual(placementChecks);
    for (const id of placementChecks) {
      expect(checks[id]).toMatchObject({
        status: "incomplete",
        explanation: expect.stringContaining("Fix or redraw"),
        issueIds: [],
      });
    }
  });

  it("keeps the missing polygon error separate from incomplete placement checks", () => {
    const checks = checksFor({ ...level, polygons: [] });

    expect(
      Object.values(checks).filter(({ status }) => status === "failed"),
    ).toEqual([checks["has-polygon"]]);
    for (const id of placementChecks) {
      expect(checks[id]).toMatchObject({
        status: "incomplete",
        explanation: expect.stringContaining("Add a ground polygon"),
      });
    }
  });

  it("explains that the start is missing", () => {
    const checks = checksFor({ ...level, start: undefined });

    expect(checks["object-inside-ground"].status).toBe("passed");
    for (const id of ["start-head", "start-wheel"]) {
      expect(checks[id]).toMatchObject({
        status: "incomplete",
        explanation: expect.stringContaining("Add a start"),
      });
    }
  });

  it("checks placement despite malformed grass", () => {
    const grass = { grass: true, vertices: [{ x: NaN, y: 0 }] };
    const checks = checksFor({ ...level, polygons: [boundary, grass] });

    for (const id of placementChecks) expect(checks[id].status).toBe("passed");
  });

  it("keeps ground burial incomplete when a polygon crosses itself and still checks start contacts", () => {
    const crossing = {
      grass: false,
      vertices: [
        { x: 20, y: 20 },
        { x: 24, y: 24 },
        { x: 20, y: 24 },
        { x: 24, y: 20 },
      ],
    };
    const checks = checksFor({
      ...level,
      polygons: [boundary, crossing],
      start: { x: 0, y: 10 },
    });

    expect(checks["self-intersection"].status).toBe("failed");
    expect(checks["object-inside-ground"]).toMatchObject({
      status: "incomplete",
      explanation: expect.stringContaining("Fix the polygon issues first"),
    });
    expect(checks["start-head"].status).toBe("passed");
    expect(checks["start-wheel"].status).toBe("failed");
  });

  it("checks start edges when the intersection scan runs out of comparisons", () => {
    const polygons = Array.from({ length: 700 }, (_, index) => {
      const y = 20 + index * 2;
      return {
        grass: false,
        vertices: [
          { x: 0, y },
          { x: 1, y },
          { x: 1, y: y + 1 },
        ],
      };
    });
    const checks = checksFor({ ...level, polygons: [boundary, ...polygons] });

    for (const id of [
      "self-intersection",
      "polygon-intersection",
      "object-inside-ground",
    ]) {
      expect(checks[id]).toMatchObject({
        status: "incomplete",
        explanation: expect.stringContaining("Simplify the polygons"),
      });
    }
    expect(checks["start-head"].status).toBe("passed");
    expect(checks["start-wheel"].status).toBe("passed");
  });

  it("retains a confirmed burial warning when another flower has an invalid position", () => {
    const checks = checksFor({
      ...level,
      flowers: [
        { x: 20, y: 0 },
        { x: NaN, y: 0 },
      ],
    });

    expect(checks["object-inside-ground"].status).toBe("warning");
  });

  it("counts an unavailable LGR once and explains how to check its graphics", () => {
    const { checks } = validateLevelTopology(
      { ...level, lgr: "custom" },
      assets,
    );

    expect(checks.filter(({ status }) => status === "warning")).toMatchObject([
      { id: "level-lgr" },
    ]);
    expect(
      checks.filter(({ status }) => status === "incomplete"),
    ).toMatchObject([
      {
        id: "lgr-graphics",
        explanation: expect.stringContaining("Load custom.lgr"),
      },
    ]);
  });
});
