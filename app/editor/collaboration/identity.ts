// Symbols survive immutable edits but never enter JSON, clipboard or .lev files.
// Identity is assigned by the room bridge, never inferred from coordinates/indexes.
const roomId = Symbol("room-id");
type Identified = { [roomId]?: string };

export function getRoomId(value: object): string | undefined {
  return (value as Identified)[roomId];
}

export function identify<T extends object>(
  value: T,
  id: string = crypto.randomUUID(),
): T {
  Object.defineProperty(value, roomId, {
    value: id,
    enumerable: true,
    configurable: true,
  });
  return value;
}

export function preserveRoomId<T extends object>(previous: object, next: T): T {
  const id = getRoomId(previous);
  return id ? identify(next, id) : next;
}
