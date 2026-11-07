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
const VERTEX_EPSILON = VERTEX_OVERLAP_EPSILON;
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
  | "narrow-angle"
  | "polygon-intersection"
  | "self-intersection"
  | "invalid-polygon"
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
  status: "passed" | "failed";
  issueIds: string[];
};
export type TopologyCheckResult = {
  issues: TopologyIssue[];
  checks: TopologyCheck[];
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

  const groundPolygons = level.polygons.filter(
    (p) => !p.grass && p.vertices.length >= 3 && p.vertices.every(finite),
  );
  const edges: EdgeRef[] = [];
  for (const polygon of level.polygons) {
    const key = String(identity(polygon));
    const vertices = polygon.vertices;
    const finiteVertices = vertices.filter(finite);
    const validCoordinates = finiteVertices.length === vertices.length;
    if (vertices.length < 3) {
      add(
        "invalid-polygon",
        key,
        "Polygon needs at least 3 vertices",
        "Add vertices or remove this incomplete polygon.",
        { vertices, locations: finiteVertices },
      );
      continue;
    }
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
      if (samePoint(start, end, VERTEX_EPSILON)) {
        const exact = start.x === end.x && start.y === end.y;
        const replacementVertices = vertices.filter((_, i) => i !== index);
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
          "These consecutive polygon vertices are less than 0.0000002 units apart on both axes. Remove the redundant vertex or move it away. Any offered repair is previewed and can be undone.",
          {
            vertices: [start, end],
            locations: [start],
            repair: canRemove
              ? { label: "Remove extra vertex", polygon, replacement }
              : undefined,
          },
        );
      } else {
        const previous =
          vertices[(index + vertices.length - 1) % vertices.length];
        const a = { x: previous.x - start.x, y: previous.y - start.y };
        const b = { x: end.x - start.x, y: end.y - start.y };
        if (
          Math.hypot(a.x, a.y) > VERTEX_EPSILON &&
          Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y)) <
            VERTEX_EPSILON
        ) {
          add(
            "narrow-angle",
            `${key}:${index}`,
            "Edges double back at a polygon vertex",
            "The two edges leave this vertex in almost the same direction (angle below 0.0000002 radians). Move the vertex slightly. The game's own checker nudges such vertices.",
            { vertices: [previous, start, end], locations: [start] },
          );
        }
      }
    }
  }

  // Sweep along X and reject disjoint edge bounds before exact intersection
  // tests. Do not compare every pair of vertices in a 20,000-vertex level.
  edges.sort((a, b) => a.minX - b.minX);
  const intersections = new Map<string, TopologyIssue>();
  let comparisons = 0;
  let intersectionScanIncomplete = false;
  intersectionScan: for (let i = 0; i < edges.length; i++) {
    const a = edges[i];
    for (
      let j = i + 1;
      j < edges.length && edges[j].minX <= a.maxX + POSITION_EPSILON;
      j++
    ) {
      if (
        ++comparisons > MAX_EDGE_COMPARISONS ||
        intersections.size >= MAX_FINDINGS
      ) {
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
      const ids = [identity(a.polygon), identity(b.polygon)].sort(
        (x, y) => x - y,
      );
      const key = `${ids[0]}:${ids[1]}`;
      let issue = intersections.get(key);
      if (!issue) {
        issue = {
          id: `${self ? "self-intersection" : "polygon-intersection"}:${key}`,
          type: self ? "self-intersection" : "polygon-intersection",
          message: self
            ? "Polygon has a self-intersection"
            : "There are intersections in the level",
          details:
            "Polygon edges intersect. Move the marked vertices, or use a polygon operation to combine the intended shapes. Grass intersections are allowed.",
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
  issues.push(...intersections.values());

  const invalidGeometry =
    validVertices.length !== allVertices.length ||
    issues.some((i) =>
      ["invalid-polygon", "self-intersection", "polygon-intersection"].includes(
        i.type,
      ),
    );
  function distanceToGroundEdge(p: Position) {
    let distance = Infinity;
    for (const edge of edges)
      distance = Math.min(
        distance,
        pointSegmentDistance(p, edge.start, edge.end),
      );
    return distance;
  }
  const canCheckGround =
    !invalidGeometry &&
    groundPolygons.length > 0 &&
    !intersectionScanIncomplete;
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
    if (!canCheckGround) continue;
    if (
      (kind === "apple" || kind === "flower") &&
      isInGround(position, groundPolygons) &&
      distanceToGroundEdge(position) >= OBJECT_DIAMETER / 2
    )
      add(
        "object-inside-ground",
        key,
        `${name} is inside ground`,
        "Its entire interaction circle is inside ground. Move it toward a surface so it can be reached. Nested polygons are checked as alternating sky and ground regions.",
        target,
      );
    if (kind === "start") {
      const head = {
        x: position.x + BODY_INIT_X - 0.09 - LEFT_WHEEL_INIT_X,
        y: position.y - (BODY_INIT_Y + 0.63 - LEFT_WHEEL_INIT_Y),
      };
      if (
        isInGround(head, groundPolygons) ||
        distanceToGroundEdge(head) < HEAD_RADIUS
      )
        add(
          "start-head",
          key,
          "The driver's head is touching ground",
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
      const badWheels = wheels.filter((p) => distanceToGroundEdge(p) < 1e-6);
      if (badWheels.length)
        add(
          "start-wheel",
          key,
          "The driver's wheel is lying on an edge",
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
  const levelLgrLoaded =
    loadedAssets !== null &&
    normalizeLgr(level.lgr ?? "default") ===
      normalizeLgr(loadedAssets.levelName);
  if (loadedAssets) {
    if (!levelLgrLoaded)
      add(
        "lgr",
        "unloaded",
        "Level LGR is not loaded",
        `Load ${level.lgr || "default"} to check its graphics. The current preview uses ${loadedAssets.levelName}.`,
      );
    else {
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
          "This picture, texture or mask is absent from the loaded LGR. Replace it or load the correct graphics file.",
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
            `${kind} texture is missing`,
            `“${name}” is absent from the loaded LGR. Choose an available texture in level properties.`,
          );
    }
  }
  const visibleIssues: TopologyIssue[] = [];
  function check(
    id: string,
    successMessage: string,
    errorMessage: string | ((issues: TopologyIssue[]) => string),
    matches: (issue: TopologyIssue) => boolean,
    blockedMessage?: string,
  ): TopologyCheck {
    const matchingIssues = issues.filter(matches);
    // Limit navigation and overlays per check without hiding errors in later checks.
    const findings = matchingIssues.slice(0, MAX_FINDINGS);
    visibleIssues.push(...findings);
    const failed = matchingIssues.length > 0 || blockedMessage !== undefined;
    return {
      id,
      status: failed ? "failed" : "passed",
      message: failed
        ? (blockedMessage ??
          (typeof errorMessage === "string"
            ? errorMessage
            : errorMessage(matchingIssues)))
        : successMessage,
      issueIds: findings.map((issue) => issue.id),
    };
  }

  function singleOrMany(message: string) {
    return (matchingIssues: TopologyIssue[]) =>
      matchingIssues.length === 1 ? matchingIssues[0].message : message;
  }

  const applesOrFlowers = objects.filter(
    ({ kind }) => kind === "apple" || kind === "flower",
  );
  const startCheckBlocked =
    !level.start || !canCheckGround || !finite(level.start);
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
      "polygon-vertex-minimum",
      "Every polygon has at least 3 vertices",
      singleOrMany("Some polygons have fewer than 3 vertices"),
      (issue) => issue.type === "invalid-polygon",
    ),
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
      "corner-angle",
      "Polygon edges do not double back at vertices",
      "Some polygon edges double back at vertices",
      (issue) => issue.type === "narrow-angle",
    ),
    check(
      "polygon-intersection",
      "There are no intersections in the level",
      singleOrMany("There are intersections in the level"),
      (issue) =>
        issue.type === "self-intersection" ||
        issue.type === "polygon-intersection",
      intersectionScanIncomplete
        ? "The intersection scan could not finish"
        : undefined,
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
      applesOrFlowers.length > 0 &&
        (!canCheckGround ||
          applesOrFlowers.some(({ position }) => !finite(position)))
        ? "Apple and flower placement could not be checked"
        : undefined,
    ),
    check(
      "start-head",
      "The driver's head is clear of ground",
      "The driver's head is touching ground",
      (issue) => issue.type === "start-head",
      startCheckBlocked ? "Head clearance could not be checked" : undefined,
    ),
    check(
      "start-wheel",
      "The driver's wheels are clear of polygon edges",
      "A driver's wheel is lying on an edge",
      (issue) => issue.type === "start-wheel",
      startCheckBlocked ? "Wheel placement could not be checked" : undefined,
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
    ),
    check(
      "level-lgr",
      "The level LGR is loaded",
      "Level LGR is not loaded",
      (issue) => issue.id === "lgr:unloaded",
      !levelLgrLoaded ? "Level LGR is not loaded" : undefined,
    ),
    check(
      "lgr-graphics",
      "Every graphic exists in the loaded LGR",
      singleOrMany("Some graphics are missing from the loaded LGR"),
      (issue) =>
        issue.type === "lgr" &&
        issue.id !== "lgr:same-texture" &&
        issue.id !== "lgr:unloaded",
      levelLgrLoaded ? undefined : "Load the level LGR to check its graphics",
    ),
  ];
  return { issues: visibleIssues, checks, width, height, bounds };
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
  return [
    `${errors.length} failed check${errors.length === 1 ? "" : "s"}.`,
    `Bounds: ${formatDimension(result.width)} x ${formatDimension(result.height)}.`,
    ...errors.map((check) => check.message),
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
