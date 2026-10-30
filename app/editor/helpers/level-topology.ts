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
  | "invalid-position"
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
  severity: "error" | "warning";
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
  label: string;
  failureLabel?: string;
  status: "passed" | "failed" | "incomplete";
  issueIds: string[];
  showWhenPassed?: boolean;
};
export type TopologyCheckResult = {
  issues: TopologyIssue[];
  checks: TopologyCheck[];
  width: number;
  height: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  truncated: boolean;
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
  const result = validateLevelTopology(level, assets, {
    includePlacementDiagnostics: true,
  });
  cached = { inputs, result };
  return result;
}

export function validateLevelTopology(
  level: LevelInput,
  assets?: TopologyAssets | null,
  options: { includePlacementDiagnostics?: boolean } = {},
): TopologyCheckResult {
  const issues: TopologyIssue[] = [];
  let truncated = false;
  function add(
    type: TopologyIssueType,
    key: string,
    message: string,
    details: string,
    data: Partial<
      Omit<TopologyIssue, "id" | "type" | "message" | "details">
    > = {},
  ) {
    if (issues.length >= MAX_FINDINGS) {
      truncated = true;
      return;
    }
    issues.push({
      id: `${type}:${key}`,
      type,
      message,
      details,
      severity: "error",
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
      "No polygons",
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
      "polygons",
      "Polygons",
      level.polygons.length,
      limits.polygons,
      "Ground and grass polygons both count.",
    ],
    [
      "vertices",
      "Vertices",
      allVertices.length,
      limits.vertices,
      "Ground and grass vertices both count.",
    ],
    [
      "objects",
      "Objects",
      objects.length,
      limits.objects,
      "The start, apples, flowers and killers all count.",
    ],
    [
      "pictures and textures",
      "Pictures and textures",
      pictures.length,
      limits.pictures,
      "Pictures and masked textures share this limit.",
    ],
  ] as const;
  for (const [name, label, count, maximum, note] of countChecks) {
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
    if (!vertices.every(finite)) {
      add(
        "invalid-position",
        key,
        "Invalid vertex coordinates",
        "This polygon contains a non-finite coordinate. Move or remove the affected vertices.",
        { vertices, locations: vertices.filter(finite) },
      );
      continue;
    }
    if (vertices.length < 3) {
      // Bear's open grass lines are useful in the editor, but EOL's file reader
      // requires at least three vertices even for grass. Repeat the last point.
      const replacement =
        polygon.grass && vertices.length === 2
          ? { ...polygon, vertices: [...vertices, { ...vertices[1] }] }
          : undefined;
      add(
        "invalid-polygon",
        key,
        polygon.grass
          ? "Grass needs 3 file vertices"
          : "Polygon needs 3 vertices",
        polygon.grass
          ? "EOL requires at least three stored vertices. Repeating the last endpoint preserves this open grass line's appearance."
          : "Add vertices or remove this incomplete polygon.",
        {
          vertices,
          locations: vertices,
          repair: replacement
            ? { label: "Fix grass", polygon, replacement }
            : undefined,
        },
      );
      continue;
    }
    if (vertices.length > limits.verticesPerPolygon)
      add(
        "limit",
        key,
        `Vertices in polygon: ${vertices.length.toLocaleString()} / ${limits.verticesPerPolygon.toLocaleString()}`,
        `SLE supports up to ${limits.verticesPerPolygon.toLocaleString()} vertices in one polygon. Simplify or split this polygon.`,
        { vertices, locations: vertices },
      );
    if (polygon.grass) continue;
    const area = polygonArea(vertices);
    if (area === 0)
      add(
        "invalid-polygon",
        key,
        "Polygon has no usable area",
        "The vertices form a line, a collapsed shape, or cancelling loops. Inspect the outline and move or remove vertices.",
        { vertices, locations: vertices },
      );
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
            "Corner is too narrow",
            "These edges almost double back on themselves (angle below 0.0000002 radians). Move this corner slightly. The game's own checker nudges such corners.",
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
  intersectionScan: for (let i = 0; i < edges.length; i++) {
    const a = edges[i];
    for (
      let j = i + 1;
      j < edges.length && edges[j].minX <= a.maxX + POSITION_EPSILON;
      j++
    ) {
      if (
        ++comparisons > MAX_EDGE_COMPARISONS ||
        issues.length + intersections.size >= MAX_FINDINGS
      ) {
        truncated = true;
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
          severity: "error",
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

  const invalidGeometry = issues.some((i) =>
    [
      "invalid-position",
      "invalid-polygon",
      "self-intersection",
      "polygon-intersection",
    ].includes(i.type),
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
  // Keep direct validation compatible with main's geometry-focused API.
  // The editor's cached check opts into placement warnings for the full panel.
  for (const { position, name, kind } of options.includePlacementDiagnostics
    ? objects
    : []) {
    const key = String(identity(position));
    const target = {
      objects: [position],
      locations: finite(position) ? [position] : [],
    };
    if (!finite(position)) {
      add(
        "invalid-position",
        key,
        `${name} has invalid coordinates`,
        "Move or remove this object before exporting.",
        target,
      );
      continue;
    }
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
    if (invalidGeometry || !groundPolygons.length || truncated) continue;
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
    if (!finite(picture.position))
      add(
        "invalid-position",
        String(identity(picture)),
        "Graphic has invalid coordinates",
        "Move or remove this picture or texture.",
        { pictures: [picture.position] },
      );
    else if (
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
      { severity: "warning" },
    );
  if (assets?.isReady()) {
    if (
      level.lgr &&
      level.lgr.toLowerCase().replace(/\.lgr$/, "") !==
        assets.levelName.toLowerCase().replace(/\.lgr$/, "")
    )
      add(
        "lgr",
        "unloaded",
        "Level LGR is not loaded",
        `Load ${level.lgr} to check its graphics. The current preview uses ${assets.levelName}.`,
        { severity: "warning" },
      );
    else {
      const missing = new Map<string, Position[]>();
      for (const picture of pictures)
        for (const name of [picture.name, picture.texture, picture.mask])
          if (name && !assets.getSprite(name))
            missing.set(name, [...(missing.get(name) ?? []), picture.position]);
      for (const [name, positions] of missing)
        add(
          "lgr",
          `graphic:${name}`,
          `Missing graphic “${name}”`,
          "This picture, texture or mask is absent from the loaded LGR. Replace it or load the correct graphics file.",
          {
            severity: "warning",
            pictures: positions,
            locations: positions.filter(finite),
          },
        );
      for (const [kind, name] of [
        ["Ground", level.ground],
        ["Sky", level.sky],
      ] as const)
        if (name && !assets.getSprite(name))
          add(
            "lgr",
            kind,
            `${kind} texture is missing`,
            `“${name}” is absent from the loaded LGR. Choose an available texture in level properties.`,
            { severity: "warning" },
          );
    }
  }
  function check(
    id: string,
    label: string,
    matches: (issue: TopologyIssue) => boolean,
    showWhenPassed = true,
    getFailureLabel?: (matchingIssues: TopologyIssue[]) => string,
  ): TopologyCheck {
    const matchingIssues = issues.filter(matches);
    const issueIds = matchingIssues.map((issue) => issue.id);
    return {
      id,
      label,
      failureLabel: matchingIssues.length
        ? getFailureLabel?.(matchingIssues)
        : undefined,
      status: issueIds.length ? "failed" : "passed",
      issueIds,
      showWhenPassed,
    };
  }
  const checks: TopologyCheck[] = [
    check(
      "has-polygon",
      "The level has a polygon",
      (issue) => issue.type === "missing-polygon",
      false,
    ),
    check(
      "has-flower",
      "The level has a flower",
      (issue) => issue.type === "missing-flower",
    ),
    check(
      "polygon-count",
      `Polygons: ${level.polygons.length.toLocaleString()} / ${limits.polygons.toLocaleString()}`,
      (issue) => issue.id === "limit:polygons",
    ),
    check(
      "vertex-count",
      `Vertices: ${allVertices.length.toLocaleString()} / ${limits.vertices.toLocaleString()}`,
      (issue) => issue.id === "limit:vertices",
    ),
    check(
      "object-count",
      `Objects: ${objects.length.toLocaleString()} / ${limits.objects.toLocaleString()}`,
      (issue) => issue.id === "limit:objects",
    ),
    check(
      "graphic-count",
      `Pictures and textures: ${pictures.length.toLocaleString()} / ${limits.pictures.toLocaleString()}`,
      (issue) => issue.id === "limit:pictures and textures",
    ),
    check(
      "level-width",
      `Width: ${formatDimension(width)} / ${limits.dimension}`,
      (issue) => issue.id === "bounds:width",
    ),
    check(
      "level-height",
      `Height: ${formatDimension(height)} / ${limits.dimension}`,
      (issue) => issue.id === "bounds:height",
    ),
    check(
      "vertex-coordinates",
      "Every vertex has valid coordinates",
      (issue) => issue.type === "invalid-position" && issue.vertices.length > 0,
      false,
    ),
    check(
      "polygon-vertex-minimum",
      "Every polygon has at least 3 file vertices",
      (issue) =>
        issue.type === "invalid-polygon" &&
        (issue.message === "Grass needs 3 file vertices" ||
          issue.message === "Polygon needs 3 vertices"),
      false,
    ),
    check(
      "polygon-vertex-maximum",
      `Every polygon has at most ${limits.verticesPerPolygon.toLocaleString()} vertices`,
      (issue) =>
        issue.type === "limit" &&
        ![
          "limit:polygons",
          "limit:vertices",
          "limit:objects",
          "limit:pictures and textures",
        ].includes(issue.id),
    ),
    check(
      "polygon-area",
      "Every polygon has usable area",
      (issue) =>
        issue.type === "invalid-polygon" &&
        issue.message === "Polygon has no usable area",
      false,
    ),
    check(
      "edge-length",
      "Polygon edges are not too short",
      (issue) =>
        issue.type === "duplicate-vertex" || issue.type === "nearby-vertex",
    ),
    check(
      "corner-angle",
      "Every polygon corner has a usable angle",
      (issue) => issue.type === "narrow-angle",
      false,
    ),
    check(
      "polygon-intersection",
      "There are no intersections in the level",
      (issue) =>
        issue.type === "self-intersection" ||
        issue.type === "polygon-intersection",
    ),
    ...(options.includePlacementDiagnostics
      ? [
          check(
            "object-coordinates",
            "Every object has valid coordinates",
            (issue) =>
              issue.type === "invalid-position" && issue.objects.length > 0,
            false,
          ),
          check(
            "object-bounds",
            "Objects are within the level borders",
            (issue) => issue.type === "object-outside",
            false,
            (matchingIssues) =>
              `${matchingIssues.length} object${matchingIssues.length === 1 ? " is" : "s are"} outside the level borders`,
          ),
          ...(!invalidGeometry && groundPolygons.length && !truncated
            ? [
                check(
                  "object-inside-ground",
                  "Apples and flowers are not inside ground",
                  (issue) => issue.type === "object-inside-ground",
                  true,
                  (matchingIssues) => {
                    const apples = matchingIssues.filter((issue) =>
                      issue.message.startsWith("Apple "),
                    ).length;
                    const flowers = matchingIssues.length - apples;
                    const objects = [
                      apples
                        ? `${apples} apple${apples === 1 ? "" : "s"}`
                        : null,
                      flowers
                        ? `${flowers} flower${flowers === 1 ? "" : "s"}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" and ");
                    return `${objects} ${matchingIssues.length === 1 ? "is" : "are"} inside ground`;
                  },
                ),
                ...(level.start
                  ? [
                      check(
                        "start-head",
                        "The driver's head is not touching ground",
                        (issue) => issue.type === "start-head",
                      ),
                      check(
                        "start-wheel",
                        "The driver's wheels are not lying on an edge",
                        (issue) => issue.type === "start-wheel",
                      ),
                    ]
                  : []),
              ]
            : []),
        ]
      : []),
    check(
      "graphic-coordinates",
      "Every graphic has valid coordinates",
      (issue) => issue.type === "invalid-position" && issue.pictures.length > 0,
      false,
    ),
    check(
      "texture-bounds",
      "Textures are not too far outside the level polygons",
      (issue) => issue.type === "texture-outside",
    ),
    check(
      "ground-sky-textures",
      "Ground and sky use different textures",
      (issue) => issue.id === "lgr:same-texture",
      false,
    ),
    ...(assets?.isReady()
      ? [
          check(
            "level-lgr",
            "The level LGR is loaded",
            (issue) => issue.id === "lgr:unloaded",
            false,
          ),
          ...(!issues.some((issue) => issue.id === "lgr:unloaded")
            ? [
                check(
                  "lgr-graphics",
                  "Every graphic exists in the loaded LGR",
                  (issue) =>
                    issue.type === "lgr" &&
                    issue.id !== "lgr:same-texture" &&
                    issue.id !== "lgr:unloaded",
                  false,
                ),
              ]
            : []),
        ]
      : []),
    ...(truncated
      ? [
          {
            id: "complete-scan",
            label: "The topology check could not finish",
            status: "incomplete" as const,
            issueIds: [],
          },
        ]
      : []),
  ];
  return { issues, checks, width, height, bounds, truncated };
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
  const errors = result.issues.filter((i) => i.severity === "error").length;
  const warnings = result.issues.length - errors;
  return [
    `${errors} errors, ${warnings} warnings.`,
    `Bounds: ${formatDimension(result.width)} x ${formatDimension(result.height)}.`,
    ...result.issues.map((i) => i.message),
    ...(result.truncated
      ? ["Check incomplete. Fix these issues and check again."]
      : []),
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
