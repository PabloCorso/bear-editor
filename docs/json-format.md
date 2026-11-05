# JSON clipboard and files

Bear Editor uses the same JSON for the clipboard and `.json` files. Use
**Level options → Import JSON…** or drop a JSON file onto the canvas. Export the
complete level with **Level options → Export JSON**. Copy selections normally;
paste JSON from another tab or an external tool using Paste.

No format/version marker or clipboard wrapper is required. The old clipboard
format is no longer accepted. Unknown properties and malformed content are
rejected with a property path; nothing is partially inserted.

## Selections

```json
{
  "polygons": [
    {
      "vertices": [
        [0, 0],
        [8, 0],
        [4, 6]
      ]
    },
    {
      "vertices": [
        [0, 0],
        [2, 1],
        [4, 0]
      ],
      "grass": true
    }
  ],
  "apples": [{ "position": [3, 1] }],
  "killers": [[6, 0]],
  "flowers": [[7, 1]],
  "pictures": [{ "name": "barrel", "position": [2, 1] }]
}
```

All collections are optional. A selection needs at least one item. All
coordinates are finite `[x,y]` tuples in world units, including polygon vertices,
apple/picture positions, killers, flowers and the level start. **X increases
rightward and Y increases downward**, as on the editor canvas. To map image
pixels, use `x = (pixelX - originX) * scale` and
`y = (pixelY - originY) * scale`; do not negate Y.

| Property   | Representation and defaults                                                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `polygons` | Objects with `vertices` and optional `grass` (default `false`). Normal polygons need at least 3 vertices; grass needs at least 2. Raw vertex arrays are not polygons.                                           |
| `apples`   | Objects with `position`, optional `animation` (1–9, default 1), and `gravity` (default 0).                                                                                                                      |
| `killers`  | Position tuples.                                                                                                                                                                                                |
| `flowers`  | Position tuples for exits.                                                                                                                                                                                      |
| `pictures` | Objects with `position`, optional `name`, `texture`, `mask` (default empty strings), `distance` (signed 32-bit integer, default 999), `clip` (default 2). Picture/texture/mask names are at most 10 characters. |

Gravity values: 0 none, 1 up, 2 down, 3 left, 4 right.
Clip values: 0 unclipped, 1 ground, 2 sky.
For a masked texture, supply `texture` and `mask`, for example:

```json
{
  "pictures": [
    { "position": [2, 3], "texture": "brick", "mask": "maskbig", "clip": 1 }
  ],
  "apples": [{ "position": [4, 5], "gravity": 1, "animation": 3 }]
}
```

Normal polygons describe ground/sky boundaries, not separately colored shapes.
Use nested contours for holes and cutouts. JSON retains the supplied vertex
order; native `.lev` export continues to normalize polygon winding and precision.

## Complete levels

A `level` metadata object distinguishes a complete level from a selection.
`level: {}` is valid and uses defaults, but a complete level always needs `start`.
A selection cannot include `start`.

```json
{
  "level": { "name": "AI landscape" },
  "start": [1, 1],
  "polygons": [
    {
      "vertices": [
        [0, 3],
        [10, 3],
        [10, 6],
        [0, 6]
      ]
    }
  ],
  "apples": [{ "position": [4, 2] }],
  "flowers": [[9, 2]]
}
```

Metadata supports `name` (default empty, at most 51 characters), `lgr` (default
`"default"`, at most 16), `ground` (default `"ground"`, at most 10), `sky` (default
`"sky"`, at most 10), and `top10`. Saved times have optional `single` and `multi`
arrays (at most 10 entries each) containing `{ "name1": "Pablo", "name2": "",
"time": 1234 }`; time is a nonnegative integer in hundredths of a second and
names have at most 15 characters. Omitted lists normalize to empty arrays.
Binary-only version/link/integrity fields are not editor metadata; they remain
managed by the existing `.lev` writer. Reference images, test starts, selection,
camera, preferences and file handles are editor session state, outside this format.

Importing a complete level from a file opens a new document through the existing
unsaved-changes guard. Importing a selection inserts it into the current document,
centered in the viewport or at the drop position. A local copied selection gets
successive `[1,1]` offsets when pasted; external JSON is centered at the paste
anchor. System clipboard permission failures retain the in-memory fallback.
A complete level pasted from the clipboard replaces level content at its original
coordinates as one undoable edit and fits the view. File imports of complete
levels start a new history, like opening a `.lev` file.

## External AI tools

Ask for plain JSON without Markdown fences or commentary. Always use polygon
objects with `vertices` and apple objects with `position`. Use `[x,y]` tuples for
coordinates, descriptive property names, and omit empty collections and default
properties. **One decimal place is usually enough for generated coordinates**;
write `2` instead of `2.0`. This is advice for generation only: copying/exporting
existing geometry preserves full JavaScript numeric precision without rounding.

For image tracing, preserve silhouettes, proportions, curves, nested contours and
negative spaces. Use Y increasing downward to avoid a vertical mirror. Ask for a
selection unless replacing the complete level is intended.

Imports and pastes check the editor's current Elma compatibility limits: 1,200
polygons, 20,000 total vertices, 1,000 vertices per polygon, 252 objects including
the level start and flowers, and 5,000 pictures. Selection pastes check the
combined destination and selection before changing content. Topology diagnostics
remain available for intersections, world dimensions and other geometric issues.
