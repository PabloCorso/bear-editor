import type { EditorLevel, Polygon, Position } from "../elma-types";
import { OBJECT_DIAMETER } from "../constants";
import { EOL_LEVEL_LIMITS as limits } from "./level-limits";
import {
  BODY_INIT_X,
  BODY_INIT_Y,
  HEAD_RADIUS,
  LEFT_WHEEL_INIT_X,
  LEFT_WHEEL_INIT_Y,
  RIGHT_WHEEL_INIT_X,
} from "../play-mode/engine/core/constants";

export const VERTEX_OVERLAP_EPSILON = 0.0000002;
const MIN_SOLID_EDGE_LENGTH = 1e-8;
const POSITION_EPSILON = 1e-10;
const MAX_FINDINGS = 200;
const MAX_EDGE_COMPARISONS = 2_000_000;

type LevelInput = Pick<EditorLevel, "polygons"> & Partial<EditorLevel>;
export type TopologyAssets = {
  levelName: string;
  isReady: () => boolean;
  getSprite: (name: string) => unknown;
};
export type TopologyIssueType =
  | "duplicate-vertex"
  | "nearby-vertex"
  | "polygon-intersection"
  | "self-intersection"
  | "missing-polygon"
  | "missing-flower"
  | "bounds"
  | "limit"
  | "object-outside"
  | "object-inside-ground"
  | "start-head"
  | "start-wheel"
  | "texture-outside"
  | "lgr";
export type TopologyRepair = {
  label: string;
  polygon: Polygon;
  replacement: Polygon;
};
export type TopologyIssue = {
  id: string;
  type: TopologyIssueType;
  message: string;
  details: string;
  locations: Position[];
  vertices: Position[];
  objects: Position[];
  pictures: Position[];
  repair?: TopologyRepair;
};
export type TopologyCheck = {
  id: string;
  message: string;
  issueIds: string[];
} & (
  | { status: "passed" | "failed" | "warning" }
  | { status: "incomplete"; explanation: string }
);
export type TopologyCheckResult = {
  issues: TopologyIssue[];
  checks: TopologyCheck[];
  intersectionScanIncomplete: boolean;
  width: number;
  height: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
};
export type TopologyInspection = {
  activeIssueId: string | null;
  activeCheckId: string | null;
  previewIssueId: string | null;
  showBounds: boolean;
};

type EdgeRef = {
  polygon: Polygon;
  index: number;
  start: Position;
  end: Position;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};
const identities = new WeakMap<object, number>();
let nextIdentity = 1;
function identity(value: object) {
  let id = identities.get(value);
  if (id === undefined) {
    id = nextIdentity++;
    identities.set(value, id);
  }
  return id;
}
const finite = (p: Position) => Number.isFinite(p.x) && Number.isFinite(p.y);
const samePoint = (a: Position, b: Position, epsilon = POSITION_EPSILON) =>
  Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon;
const formatDimension = (value: number) => Number(value.toFixed(2)).toString();

// Camera, hover and selection updates must not rerun geometry checks. Both the
// panel and canvas consume this same cached result; edits/undo replace the refs.
let cached: { inputs: unknown[]; result: TopologyCheckResult } | undefined;
export function getLevelTopology(
  level: LevelInput,
  assets?: TopologyAssets | null,
) {
  const inputs = [
    level.polygons,
    level.apples,
    level.killers,
    level.flowers,
    level.start,
    level.pictures,
    level.ground,
    level.sky,
    level.lgr,
    assets,
    assets?.isReady(),
  ];
  if (cached && inputs.every((input, index) => input === cached!.inputs[index]))
    return cached.result;
  const result = validateLevelTopology(level, assets);
  cached = { inputs, result };
  return result;
}

export function validateLevelTopology(
  level: LevelInput,
  assets?: TopologyAssets | null,
): TopologyCheckResult {
  const issues: TopologyIssue[] = [];
  function add(
    type: TopologyIssueType,
    key: string,
    message: string,
    details: string,
    data: Partial<
      Omit<TopologyIssue, "id" | "type" | "message" | "details">
    > = {},
  ) {
    issues.push({
      id: `${type}:${key}`,
      type,
      message,
      details,
      locations: [],
      vertices: [],
      objects: [],
      pictures: [],
      ...data,
    });
  }
  const allVertices = level.polygons.flatMap((p) => p.vertices);
  const validVertices = allVertices.filter(finite);
  const bounds = validVertices.length
    ? validVertices.reduce(
        (b, p) => ({
          minX: Math.min(b.minX, p.x),
          maxX: Math.max(b.maxX, p.x),
          minY: Math.min(b.minY, p.y),
          maxY: Math.max(b.maxY, p.y),
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      )
    : null;
  const width = bounds ? bounds.maxX - bounds.minX : 0;
  const height = bounds ? bounds.maxY - bounds.minY : 0;
  const corners = bounds
    ? [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
      ]
    : [];

  if (!level.polygons.length)
    add(
      "missing-polygon",
      "level",
      "The level needs a polygon",
      "Add at least one polygon before exporting the level.",
    );
  if (!level.flowers?.length)
    add(
      "missing-flower",
      "level",
      "The level needs a flower",
      "Add a flower so the level can be finished.",
    );
  const objects = [
    ...(level.start
      ? [{ position: level.start, name: "Start", kind: "start" }]
      : []),
    ...(level.apples ?? []).map((a) => ({
      position: a.position,
      name: "Apple",
      kind: "apple",
    })),
    ...(level.flowers ?? []).map((position) => ({
      position,
      name: "Flower",
      kind: "flower",
    })),
    ...(level.killers ?? []).map((position) => ({
      position,
      name: "Killer",
      kind: "killer",
    })),
  ];
  const pictures = level.pictures ?? [];
  const countChecks = [
    [
      "polygon-count",
      "polygons",
      "Polygons",
      level.polygons.length,
      limits.polygons,
      "Ground and grass polygons both count.",
    ],
    [
      "vertex-count",
      "vertices",
      "Vertices",
      allVertices.length,
      limits.vertices,
      "Ground and grass vertices both count.",
    ],
    [
      "object-count",
      "objects",
      "Objects",
      objects.length,
      limits.objects,
      "The start, apples, flowers and killers all count.",
    ],
    [
      "graphic-count",
      "pictures and textures",
      "Pictures and textures",
      pictures.length,
      limits.pictures,
      "Pictures and masked textures share this limit.",
    ],
  ] as const;
  for (const [, name, label, count, maximum, note] of countChecks) {
    if (count <= maximum) continue;
    add(
      "limit",
      name,
      `${label}: ${count.toLocaleString()} / ${maximum.toLocaleString()}`,
      `${maximum.toLocaleString()} maximum. Remove ${(count - maximum).toLocaleString()} or more. ${note}`,
      {
        locations: corners,
        vertices:
          name === "vertices"
            ? ([...level.polygons].sort(
                (a, b) => b.vertices.length - a.vertices.length,
              )[0]?.vertices ?? [])
            : [],
      },
    );
  }
  for (const axis of ["width", "height"] as const) {
    const size = axis === "width" ? width : height;
    if (size <= limits.dimension || !bounds) continue;
    const coordinate = axis === "width" ? "x" : "y";
    const min = coordinate === "x" ? bounds.minX : bounds.minY;
    const max = coordinate === "x" ? bounds.maxX : bounds.maxY;
    const extremes = validVertices.filter(
      (p) => p[coordinate] === min || p[coordinate] === max,
    );
    add(
      "bounds",
      axis,
      `${axis === "width" ? "Width" : "Height"}: ${formatDimension(size)} / ${limits.dimension}`,
      `${formatDimension(size)} / ${limits.dimension} units. The span includes ground and grass, regardless of position. Move the extreme vertices inward or resize the level.`,
      { locations: corners, vertices: extremes },
    );
  }

  const solidPolygons = level.polygons.filter((polygon) => !polygon.grass);
  const groundPolygons = solidPolygons.filter(
    (polygon) => polygon.vertices.length >= 3 && polygon.vertices.every(finite),
  );
  const edges: EdgeRef[] = [];
  for (const polygon of level.polygons) {
    const key = String(identity(polygon));
    const vertices = polygon.vertices;
    const finiteVertices = vertices.filter(finite);
    const validCoordinates = finiteVertices.length === vertices.length;
    if (vertices.length < 3) continue;
    if (vertices.length > limits.verticesPerPolygon)
      add(
        "limit",
        key,
        `Vertices in polygon: ${vertices.length.toLocaleString()} / ${limits.verticesPerPolygon.toLocaleString()}`,
        `SLE supports up to ${limits.verticesPerPolygon.toLocaleString()} vertices in one polygon. Simplify or split this polygon.`,
        { vertices, locations: finiteVertices },
      );
    if (polygon.grass || !validCoordinates) continue;
    const area = polygonArea(vertices);
    for (let index = 0; index < vertices.length; index++) {
      const start = vertices[index],
        end = vertices[(index + 1) % vertices.length];
      edges.push({
        polygon,
        index,
        start,
        end,
        minX: Math.min(start.x, end.x),
        maxX: Math.max(start.x, end.x),
        minY: Math.min(start.y, end.y),
        maxY: Math.max(start.y, end.y),
      });
      if (
        Math.hypot(end.x - start.x, end.y - start.y) < MIN_SOLID_EDGE_LENGTH
      ) {
        const exact = start.x === end.x && start.y === end.y;
        const replacementVertices = exact
          ? vertices.filter((_, i) => i !== index)
          : vertices;
        const replacement = { ...polygon, vertices: replacementVertices };
        // Only offer removal of a consecutive redundant point, preserving at
        // least a triangle and the signed area. No random save-time nudging.
        const canRemove =
          exact &&
          replacementVertices.length >= 3 &&
          area !== 0 &&
          Math.sign(polygonArea(replacementVertices)) === Math.sign(area);
        add(
          exact ? "duplicate-vertex" : "nearby-vertex",
          `${key}:${index}`,
          exact
            ? "Two consecutive polygon vertices overlap"
            : "Polygon edge is too short",
          "This edge is shorter than 0.00000001 units. Remove the redundant vertex or move it away. Any offered repair is previewed and can be undone.",
          {
            vertices: [start, end],
            locations: [start],
            repair: canRemove
              ? { label: "Remove extra vertex", polygon, replacement }
              : undefined,
          },
        );
      }
    }
  }

  // Sweep along X and reject disjoint edge bounds before exact intersection
  // tests. Do not compare every pair of vertices in a 20,000-vertex level.
  edges.sort((a, b) => a.minX - b.minX);
  const selfIntersections = new Map<string, TopologyIssue>();
  const polygonIntersections = new Map<string, TopologyIssue>();
  let comparisons = 0;
  let intersectionScanIncomplete = false;
  intersectionScan: for (let i = 0; i < edges.length; i++) {
    const a = edges[i];
    for (
      let j = i + 1;
      j < edges.length && edges[j].minX <= a.maxX + POSITION_EPSILON;
      j++
    ) {
      if (++comparisons > MAX_EDGE_COMPARISONS) {
        intersectionScanIncomplete = true;
        break intersectionScan;
      }
      const b = edges[j];
      if (
        b.minY > a.maxY + POSITION_EPSILON ||
        a.minY > b.maxY + POSITION_EPSILON
      )
        continue;
      const contacts = segmentContacts(a.start, a.end, b.start, b.end);
      if (!contacts.length) continue;
      const shared = [a.start, a.end].filter(
        (p) => samePoint(p, b.start) || samePoint(p, b.end),
      );
      // A common endpoint is allowed; overlapping segments beyond it are not.
      if (
        contacts.length === 1 &&
        shared.some((p) => samePoint(p, contacts[0]))
      )
        continue;
      const self = a.polygon === b.polygon;
      const intersections = self ? selfIntersections : polygonIntersections;
      const ids = [identity(a.polygon), identity(b.polygon)].sort(
        (x, y) => x - y,
      );
      const key = `${ids[0]}:${ids[1]}`;
      let issue = intersections.get(key);
      if (!issue) {
        // Keep scanning after the marker budget is reached so either check can fail.
        if (intersections.size >= MAX_FINDINGS) continue;
        issue = {
          id: `${self ? "self-intersection" : "polygon-intersection"}:${key}`,
          type: self ? "self-intersection" : "polygon-intersection",
          message: self
            ? "Polygon crosses itself"
            : "Edges of different polygons intersect",
          details: self
            ? "Move the marked vertices so the polygon no longer crosses itself."
            : "Move the marked vertices or combine the polygons if they should form one shape.",
          vertices: [],
          locations: [],
          objects: [],
          pictures: [],
        };
        intersections.set(key, issue);
      }
      for (const p of [a.start, a.end, b.start, b.end])
        if (!issue.vertices.includes(p)) issue.vertices.push(p);
      for (const p of contacts)
        if (
          issue.locations.length < MAX_FINDINGS &&
          !issue.locations.some((q) => samePoint(p, q))
        )
          issue.locations.push(p);
    }
  }
  issues.push(...selfIntersections.values(), ...polygonIntersections.values());

  const scanExplanation =
    "There are too many edges to compare. Simplify the polygons and check again.";
  const polygonExplanation =
    "Some ground polygons are invalid. Fix the polygon issues first.";
  const groundEdgeExplanation =
    solidPolygons.length === 0
      ? "Add a ground polygon to check placement."
      : groundPolygons.length !== solidPolygons.length
        ? "Some ground polygons have missing or invalid vertices. Fix or redraw those polygons first."
        : undefined;
  // Burial requires an unambiguous ground region. Start checks only look for
  // contact with individual edges, which are still known when polygons cross.
  const groundRegionExplanation =
    groundEdgeExplanation ??
    (selfIntersections.size || polygonIntersections.size
      ? polygonExplanation
      : intersectionScanIncomplete
        ? scanExplanation
        : undefined);
  function distanceToGroundEdge(p: Position) {
    let distance = Infinity;
    for (const edge of edges)
      distance = Math.min(
        distance,
        pointSegmentDistance(p, edge.start, edge.end),
      );
    return distance;
  }
  for (const { position, name, kind } of objects) {
    if (!finite(position)) continue;
    const key = String(identity(position));
    const target = { objects: [position], locations: [position] };
    if (
      bounds &&
      (position.x < bounds.minX - limits.objectBorder ||
        position.x > bounds.maxX + limits.objectBorder ||
        position.y < bounds.minY - limits.objectBorder ||
        position.y > bounds.maxY + limits.objectBorder)
    )
      add(
        "object-outside",
        key,
        `${name} is outside the level borders`,
        "EOL allows object centres up to one unit beyond the level borders. Move this object closer to the level.",
        target,
      );
    if (
      !groundRegionExplanation &&
      (kind === "apple" || kind === "flower") &&
      isInGround(position, groundPolygons) &&
      distanceToGroundEdge(position) >= OBJECT_DIAMETER / 2
    )
      add(
        "object-inside-ground",
        key,
        `${name} is fully inside ground`,
        "This object may be hard to reach. If it is needed to finish the level, verify it in play mode.",
        target,
      );
    if (kind === "start") {
      const head = {
        x: position.x + BODY_INIT_X - 0.09 - LEFT_WHEEL_INIT_X,
        y: position.y - (BODY_INIT_Y + 0.63 - LEFT_WHEEL_INIT_Y),
      };
      if (distanceToGroundEdge(head) <= HEAD_RADIUS)
        add(
          "start-head",
          key,
          "The rider’s head hits ground at the start",
          "Move the start to give the driver's head clearance.",
          { ...target, locations: [head] },
        );
      const wheels = [
        position,
        {
          x: position.x + RIGHT_WHEEL_INIT_X - LEFT_WHEEL_INIT_X,
          y: position.y,
        },
      ];
      // Elma can push overlapping wheels out of ground. Its collision normal
      // is undefined only when the wheel center and contact point coincide.
      const badWheels = wheels.filter((p) => distanceToGroundEdge(p) === 0);
      if (badWheels.length)
        add(
          "start-wheel",
          key,
          "A wheel center starts on a polygon edge",
          "Move the start slightly so neither wheel centre lies exactly on a polygon edge.",
          { ...target, locations: badWheels },
        );
    }
  }
  for (const picture of pictures) {
    if (!finite(picture.position)) continue;
    if (
      picture.texture &&
      bounds &&
      (picture.position.x < bounds.minX - 11.898 ||
        picture.position.x > bounds.maxX + 11.898 ||
        picture.position.y < bounds.minY - 11.898 ||
        picture.position.y > bounds.maxY + 11.898)
    )
      add(
        "texture-outside",
        String(identity(picture)),
        "Texture is too far outside the level polygons",
        "SLE flags textures more than 11.898 units beyond polygon bounds. Move it closer if it should appear in the game.",
        {
          pictures: [picture.position],
          locations: [picture.position],
        },
      );
  }
  if (
    level.ground &&
    level.sky &&
    level.ground.toLowerCase() === level.sky.toLowerCase()
  )
    add(
      "lgr",
      "same-texture",
      "Ground and sky use the same texture",
      "The game warns that identical foreground and background textures can load incorrectly. Choose different textures.",
    );
  const loadedAssets = assets?.isReady() ? assets : null;
  const normalizeLgr = (name: string) =>
    name.toLowerCase().replace(/\.lgr$/, "") || "default";
  const levelLgrName = level.lgr || "default";
  const levelLgrLoaded =
    loadedAssets !== null &&
    normalizeLgr(levelLgrName) === normalizeLgr(loadedAssets.levelName);
  const levelLgrFile = `${levelLgrName.replace(/\.lgr$/i, "")}.lgr`;
  if (!levelLgrLoaded) {
    add(
      "lgr",
      "unloaded",
      `Load ${levelLgrFile} to check its graphics`,
      "The preview may use a different LGR while the level’s graphics are unavailable.",
    );
  } else {
    const missing = new Map<string, Position[]>();
    for (const picture of pictures)
      for (const name of [picture.name, picture.texture, picture.mask])
        if (name && !loadedAssets.getSprite(name)) {
          const positions = missing.get(name);
          if (positions) positions.push(picture.position);
          else missing.set(name, [picture.position]);
        }
    for (const [name, positions] of missing)
      add(
        "lgr",
        `graphic:${name}`,
        `Missing graphic “${name}”`,
        "This picture, texture, or mask is unavailable in the level’s LGR. It may appear for players using a different LGR.",
        {
          pictures: positions,
          locations: positions.filter(finite),
        },
      );
    for (const [kind, name] of [
      ["Ground", level.ground],
      ["Sky", level.sky],
    ] as const)
      if (name && !loadedAssets.getSprite(name))
        add(
          "lgr",
          kind,
          `${kind} texture “${name}” is missing`,
          `“${name}” is absent from the loaded LGR. Choose an available texture in level properties.`,
        );
  }
  const visibleIssues: TopologyIssue[] = [];
  function check(
    id: string,
    successMessage: string,
    errorMessage: string | ((issues: TopologyIssue[]) => string),
    matches: (issue: TopologyIssue) => boolean,
    options: {
      incomplete?: { message: string; explanation: string };
      findingStatus?: "failed" | "warning";
    } = {},
  ): TopologyCheck {
    const { incomplete, findingStatus = "failed" } = options;
    const matchingIssues = issues.filter(matches);
    // Limit navigation and overlays per check without hiding errors in later checks.
    const findings = matchingIssues.slice(0, MAX_FINDINGS);
    visibleIssues.push(...findings);
    const issueIds = findings.map((issue) => issue.id);
    if (findings.length)
      return {
        id,
        issueIds,
        status: findingStatus,
        message:
          typeof errorMessage === "string"
            ? errorMessage
            : errorMessage(matchingIssues),
      };
    if (incomplete)
      return { id, issueIds, status: "incomplete", ...incomplete };
    return { id, issueIds, status: "passed", message: successMessage };
  }

  function singleOrMany(message: string) {
    return (matchingIssues: TopologyIssue[]) =>
      matchingIssues.length === 1 ? matchingIssues[0].message : message;
  }

  const applesOrFlowers = objects.filter(
    ({ kind }) => kind === "apple" || kind === "flower",
  );
  const startExplanation = !level.start
    ? "Add a start to the level to check the rider’s position."
    : !finite(level.start)
      ? "The start has an invalid position. Move it to a new spot."
      : groundEdgeExplanation;
  const appleFlowerExplanation = applesOrFlowers.length
    ? (groundRegionExplanation ??
      (applesOrFlowers.some(({ position }) => !finite(position))
        ? "An apple or flower has an invalid position. Move it to a new spot."
        : undefined))
    : undefined;
  const checks = [
    check(
      "has-polygon",
      "The level has a polygon",
      "The level needs a polygon",
      (issue) => issue.type === "missing-polygon",
    ),
    check(
      "has-flower",
      "The level has a flower",
      "The level needs a flower",
      (issue) => issue.type === "missing-flower",
    ),
    ...countChecks.map(([id, name, label, count, maximum]) => {
      const usage = `${label}: ${count.toLocaleString()} / ${maximum.toLocaleString()}`;
      return check(
        id,
        usage,
        `${usage} (over limit)`,
        (issue) => issue.id === `limit:${name}`,
      );
    }),
    ...(["width", "height"] as const).map((axis) => {
      const label = axis === "width" ? "Width" : "Height";
      const size = axis === "width" ? width : height;
      const usage = `${label}: ${formatDimension(size)} / ${limits.dimension}`;
      return check(
        `level-${axis}`,
        usage,
        `${usage} (over limit)`,
        (issue) => issue.id === `bounds:${axis}`,
      );
    }),
    check(
      "polygon-vertex-maximum",
      `Every polygon has at most ${limits.verticesPerPolygon.toLocaleString()} vertices`,
      `Some polygons have more than ${limits.verticesPerPolygon.toLocaleString()} vertices`,
      (issue) =>
        issue.type === "limit" &&
        !countChecks.some(([, name]) => issue.id === `limit:${name}`),
    ),
    check(
      "edge-length",
      "Polygon edges are not too short",
      singleOrMany("Some polygon edges are too short"),
      (issue) =>
        issue.type === "duplicate-vertex" || issue.type === "nearby-vertex",
    ),
    check(
      "self-intersection",
      "No polygons cross themselves",
      singleOrMany("Some polygons cross themselves"),
      (issue) => issue.type === "self-intersection",
      {
        incomplete: intersectionScanIncomplete
          ? {
              message: "Self-intersections could not be ruled out",
              explanation: scanExplanation,
            }
          : undefined,
      },
    ),
    check(
      "polygon-intersection",
      "Edges of different polygons do not intersect",
      "Edges of different polygons intersect",
      (issue) => issue.type === "polygon-intersection",
      {
        incomplete: intersectionScanIncomplete
          ? {
              message: "Intersections between polygons could not be ruled out",
              explanation: scanExplanation,
            }
          : undefined,
      },
    ),
    check(
      "object-bounds",
      "Objects are within the level borders",
      singleOrMany("Some objects are outside the level borders"),
      (issue) => issue.type === "object-outside",
    ),
    check(
      "object-inside-ground",
      "No apples or flowers are fully inside ground",
      singleOrMany("Some apples or flowers are fully inside ground"),
      (issue) => issue.type === "object-inside-ground",
      {
        findingStatus: "warning",
        incomplete: appleFlowerExplanation
          ? {
              message: "Apple and flower placement could not be checked",
              explanation: appleFlowerExplanation,
            }
          : undefined,
      },
    ),
    check(
      "start-head",
      "The driver's head is clear of ground",
      "The rider’s head hits ground at the start",
      (issue) => issue.type === "start-head",
      {
        incomplete: startExplanation
          ? {
              message: "Head clearance could not be checked",
              explanation: startExplanation,
            }
          : undefined,
      },
    ),
    check(
      "start-wheel",
      "Neither wheel center starts on a polygon edge",
      "A wheel center starts on a polygon edge",
      (issue) => issue.type === "start-wheel",
      {
        incomplete: startExplanation
          ? {
              message: "Wheel placement could not be checked",
              explanation: startExplanation,
            }
          : undefined,
      },
    ),
    check(
      "texture-bounds",
      "Textures are not too far outside the level polygons",
      "Some textures are too far outside the level polygons",
      (issue) => issue.type === "texture-outside",
    ),
    check(
      "ground-sky-textures",
      "Ground and sky use different textures",
      "Ground and sky use the same texture",
      (issue) => issue.id === "lgr:same-texture",
      { findingStatus: "warning" },
    ),
    check(
      "level-lgr",
      "The level LGR is loaded",
      `Load ${levelLgrFile} to check its graphics`,
      (issue) => issue.id === "lgr:unloaded",
      { findingStatus: "warning" },
    ),
    check(
      "lgr-graphics",
      "All referenced graphics are available",
      singleOrMany("Some graphics are missing from the level’s LGR"),
      (issue) =>
        issue.type === "lgr" &&
        issue.id !== "lgr:same-texture" &&
        issue.id !== "lgr:unloaded",
      {
        findingStatus: "warning",
        incomplete: levelLgrLoaded
          ? undefined
          : {
              message: "Graphics could not be checked",
              explanation: `Load ${levelLgrFile} to check the level’s graphics.`,
            },
      },
    ),
  ];
  return {
    issues: visibleIssues,
    checks,
    intersectionScanIncomplete,
    width,
    height,
    bounds,
  };
}

export function getTopologySelection(
  polygons: Polygon[],
  issues: TopologyIssue[],
) {
  const affected = new Set(issues.flatMap((i) => i.vertices));
  return polygons.flatMap((polygon) =>
    polygon.vertices
      .filter((vertex) => affected.has(vertex))
      .map((vertex) => ({ polygon, vertex })),
  );
}

export function getTopologyRepairPolygons(
  polygons: Polygon[],
  issue: TopologyIssue,
): Polygon[] | null {
  const repair = issue.repair;
  if (!repair || !polygons.includes(repair.polygon)) return null;
  return polygons.map((p) => (p === repair.polygon ? repair.replacement : p));
}

export function formatTopologyCheckResult(result: TopologyCheckResult) {
  const errors = result.checks.filter((check) => check.status === "failed");
  const warnings = result.checks.filter((check) => check.status === "warning");
  return [
    `${errors.length} failed check${errors.length === 1 ? "" : "s"}.`,
    `Bounds: ${formatDimension(result.width)} x ${formatDimension(result.height)}.`,
    ...(result.intersectionScanIncomplete
      ? ["Intersection check incomplete."]
      : []),
    ...errors.map((check) => check.message),
    ...warnings.map((check) => `Warning: ${check.message}`),
    ...result.checks.flatMap((check) =>
      check.status === "incomplete"
        ? [`${check.message}. ${check.explanation}`]
        : [],
    ),
  ].join("\n");
}

function polygonArea(vertices: Position[]) {
  // Translate first to avoid cancellation in levels far from the origin.
  const origin = vertices[0];
  return (
    vertices.reduce((area, p, i) => {
      const q = vertices[(i + 1) % vertices.length];
      return (
        area +
        (p.x - origin.x) * (q.y - origin.y) -
        (q.x - origin.x) * (p.y - origin.y)
      );
    }, 0) / 2
  );
}
function isInGround(p: Position, polygons: Polygon[]) {
  let inside = false;
  for (const polygon of polygons) {
    const v = polygon.vertices;
    for (let i = 0, j = v.length - 1; i < v.length; j = i++)
      if (
        v[i].y > p.y !== v[j].y > p.y &&
        p.x < ((v[j].x - v[i].x) * (p.y - v[i].y)) / (v[j].y - v[i].y) + v[i].x
      )
        inside = !inside;
  }
  return !inside;
}
export function pointSegmentDistance(p: Position, a: Position, b: Position) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2))
    : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function segmentContacts(
  a: Position,
  b: Position,
  c: Position,
  d: Position,
): Position[] {
  const rx = b.x - a.x,
    ry = b.y - a.y,
    sx = d.x - c.x,
    sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (
    Math.abs(denominator) >
    Number.EPSILON * 16 * (Math.abs(rx * sy) + Math.abs(ry * sx))
  ) {
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denominator;
    const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denominator;
    if (
      t < -POSITION_EPSILON ||
      t > 1 + POSITION_EPSILON ||
      u < -POSITION_EPSILON ||
      u > 1 + POSITION_EPSILON
    )
      return [];
    return [{ x: a.x + t * rx, y: a.y + t * ry }];
  }
  return [a, b, c, d].filter(
    (p, index, points) =>
      points.findIndex((q) => samePoint(p, q)) === index &&
      pointSegmentDistance(p, a, b) < POSITION_EPSILON &&
      pointSegmentDistance(p, c, d) < POSITION_EPSILON,
  );
}
