import * as Y from "yjs";
import equal from "fast-deep-equal";
import type { EditorLevel, Polygon, Position } from "../elma-types";
import { getRoomId, identify } from "./identity";

export const ROOM_SCHEMA = 1;
export const LOCAL_EDIT = Symbol("local-room-edit");
const collections = [
  "polygons",
  "apples",
  "killers",
  "flowers",
  "pictures",
] as const;
const metadata = [
  "levelName",
  "lgr",
  "ground",
  "sky",
  "start",
  "top10",
] as const;
const MAX_ENTITIES = 50000;
const MAX_VERTICES = 200000;
type RecordMap = Y.Map<unknown>;

function requireMap(value: unknown): RecordMap {
  if (!(value instanceof Y.Map))
    throw new Error("The session contains invalid level data.");
  return value;
}
function requireOrder(value: unknown): Y.Array<string> {
  if (
    !(value instanceof Y.Array) ||
    value.length > MAX_VERTICES ||
    value.toArray().some((id) => typeof id !== "string" || id.length > 100)
  ) {
    throw new Error("The session contains invalid ordering data.");
  }
  return value;
}
function finite(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= 1e9
  );
}
function validPosition(value: unknown): value is Position {
  return (
    !!value &&
    typeof value === "object" &&
    finite((value as Position).x) &&
    finite((value as Position).y)
  );
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200;
}
export function validateLevel(level: EditorLevel) {
  if (
    !metadata.slice(0, 4).every((key) => text(level[key])) ||
    !validPosition(level.start)
  )
    throw new Error("The session contains invalid level properties.");
  let count = 0;
  for (const key of collections) {
    if (!Array.isArray(level[key]) || level[key].length > MAX_ENTITIES)
      throw new Error("This level is too large for a session.");
  }
  for (const polygon of level.polygons) {
    count += polygon.vertices.length;
    if (
      typeof polygon.grass !== "boolean" ||
      polygon.vertices.length < 3 ||
      !polygon.vertices.every(validPosition)
    )
      throw new Error("Finish or remove incomplete polygons before sharing.");
  }
  if (count > MAX_VERTICES)
    throw new Error("This level is too large for a session.");
  if (
    !level.killers.every(validPosition) ||
    !level.flowers.every(validPosition) ||
    !level.apples.every(
      (a) =>
        validPosition(a.position) &&
        Number.isInteger(a.animation) &&
        a.animation >= 1 &&
        a.animation <= 9 &&
        Number.isInteger(a.gravity) &&
        a.gravity >= 0 &&
        a.gravity <= 4,
    ) ||
    !level.pictures.every(
      (p) =>
        validPosition(p.position) &&
        text(p.name) &&
        text(p.texture) &&
        text(p.mask) &&
        finite(p.distance) &&
        [0, 1, 2].includes(p.clip),
    )
  )
    throw new Error("The session contains invalid objects or pictures.");
  if (
    level.top10 &&
    ![level.top10.single, level.top10.multi].every(
      (entries) =>
        Array.isArray(entries) &&
        entries.length <= 10 &&
        entries.every(
          (entry) =>
            finite(entry.time) && text(entry.name1) && text(entry.name2),
        ),
    )
  )
    throw new Error("The session contains invalid best times.");
}

function id(value: object) {
  return getRoomId(value) ?? getRoomId(identify(value))!;
}
function orderedRecords(parent: RecordMap) {
  const records = requireMap(parent.get("records"));
  const order = requireOrder(parent.get("order"));
  if (records.size > MAX_VERTICES)
    throw new Error("This session is too large.");
  // Simultaneous reorders may leave duplicate order entries. A record still
  // materializes exactly once; deleting a record wins over stale order entries.
  return [...new Set(order.toArray())].flatMap((key) =>
    records.has(key) ? [[key, requireMap(records.get(key))] as const] : [],
  );
}
function createCollection() {
  const map = new Y.Map();
  map.set("records", new Y.Map());
  map.set("order", new Y.Array());
  return map;
}
function fields(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "vertices"),
  );
}
function updateFields(target: RecordMap, before: object, after: object) {
  const previous = fields(before);
  for (const [key, value] of Object.entries(fields(after))) {
    if (!equal(previous[key], value)) target.set(key, structuredClone(value));
  }
}
function syncOrder(order: Y.Array<string>, before: string[], after: string[]) {
  if (equal(before, after)) return;
  if (
    after.length >= before.length &&
    before.every((key, index) => after[index] === key)
  ) {
    order.push(after.slice(before.length));
    return;
  }
  const desired = new Set(after);
  const removed = new Set(before.filter((key) => !desired.has(key)));
  for (let i = order.length - 1; i >= 0; i--)
    if (removed.has(order.get(i))) order.delete(i);
  // Preserve concurrent insertions not in this author's before snapshot.
  let cursor = 0;
  for (const key of after) {
    const values = order.toArray();
    const existing = values.indexOf(key, cursor);
    if (existing !== -1) {
      const skippedLocal = values
        .slice(cursor, existing)
        .some((candidate) => desired.has(candidate));
      if (!skippedLocal) {
        cursor = existing + 1;
        continue;
      }
      order.delete(existing);
    }
    order.insert(cursor++, [key]);
  }
}
function syncCollection(
  parent: RecordMap,
  before: object[],
  after: object[],
  vertices = false,
  polygons = false,
) {
  const records = requireMap(parent.get("records"));
  const order = requireOrder(parent.get("order"));
  const previous = new Map(before.map((value) => [id(value), value]));
  const next = new Map(after.map((value) => [id(value), value]));
  if (next.size !== after.length)
    throw new Error("This edit duplicated a session identity.");
  for (const key of previous.keys()) if (!next.has(key)) records.delete(key);
  for (const [key, value] of next) {
    const old = previous.get(key);
    if (old === value) continue;
    let record = records.get(key) as RecordMap | undefined;
    // Do not resurrect an entity deleted by another participant during a drag.
    if (old && !record) continue;
    if (!record) {
      record = new Y.Map();
      records.set(key, record);
      if (polygons) record.set("vertices", createCollection());
    }
    if (vertices) {
      if (!equal(old, value))
        record.set("position", [(value as Position).x, (value as Position).y]);
    } else {
      updateFields(record, old ?? {}, value);
      if (polygons)
        syncCollection(
          requireMap(record.get("vertices")),
          (old as Polygon | undefined)?.vertices ?? [],
          (value as Polygon).vertices,
          true,
        );
    }
  }
  syncOrder(order, [...previous.keys()], [...next.keys()]);
}

export class RoomDocument {
  readonly doc = new Y.Doc();
  readonly root = this.doc.getMap("level");

  get initialized() {
    return this.root.has("version");
  }

  seed(level: EditorLevel) {
    if (this.initialized)
      throw new Error("This session is already initialized.");
    validateLevel(level);
    this.doc.transact(() => {
      this.root.set("version", ROOM_SCHEMA);
      for (const key of metadata)
        if (level[key] !== undefined)
          this.root.set(key, structuredClone(level[key]));
      for (const key of collections) {
        const collection = createCollection();
        this.root.set(key, collection);
        syncCollection(collection, [], level[key], false, key === "polygons");
      }
    });
  }

  commit(before: EditorLevel, after: EditorLevel) {
    validateLevel(after);
    // Validate identities before touching Yjs; a failed edit must be atomic.
    for (const key of collections) {
      const values = after[key];
      if (new Set(values.map(id)).size !== values.length)
        throw new Error("This tool cannot safely edit this session yet.");
      if (key === "polygons")
        for (const polygon of after.polygons)
          if (
            new Set(polygon.vertices.map(id)).size !== polygon.vertices.length
          )
            throw new Error("This polygon has repeated vertices.");
    }
    this.doc.transact(() => {
      for (const key of metadata)
        if (!equal(before[key], after[key])) {
          if (after[key] === undefined) this.root.delete(key);
          else this.root.set(key, structuredClone(after[key]));
        }
      for (const key of collections)
        if (before[key] !== after[key])
          syncCollection(
            requireMap(this.root.get(key)),
            before[key],
            after[key],
            false,
            key === "polygons",
          );
    }, LOCAL_EDIT);
  }

  read(): EditorLevel {
    if (this.root.get("version") !== ROOM_SCHEMA)
      throw new Error(
        "This session uses a different editor version. Refresh Bear Editor and try again.",
      );
    const level: Record<string, unknown> = {};
    for (const key of metadata)
      level[key] = structuredClone(this.root.get(key));
    for (const key of collections) {
      level[key] = orderedRecords(requireMap(this.root.get(key))).flatMap(
        ([key, record]) => {
          const value = structuredClone(
            Object.fromEntries(
              [...record.entries()].filter(([field]) => field !== "vertices"),
            ),
          );
          if (record.has("vertices")) {
            value.vertices = orderedRecords(
              requireMap(record.get("vertices")),
            ).map(([vertexId, vertex]) => {
              const position = vertex.get("position");
              if (
                !Array.isArray(position) ||
                position.length !== 2 ||
                !position.every(finite)
              )
                throw new Error("The session contains an invalid vertex.");
              return identify({ x: position[0], y: position[1] }, vertexId);
            });
            // Two valid concurrent deletions can leave fewer than three points.
            // Omit that contour consistently instead of rendering broken terrain.
            if ((value.vertices as Position[]).length < 3) return [];
          }
          return [identify(value, key)];
        },
      );
    }
    const result = level as EditorLevel;
    validateLevel(result);
    return result;
  }
}
