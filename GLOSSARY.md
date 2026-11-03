# Bear Editor

Bear Editor uses the established Elasto Mania level-editing language used by
the game and community editors.

## Language

**Polygon**:
A level shape that is either a ground polygon or a grass polygon.

**Ground polygon**:
A non-grass polygon whose outline participates in the level's ground and sky
topology.
_Avoid_: Solid polygon

**Grass polygon**:
A polygon that draws grass without participating in ground collision.

**Flower**:
The finish object. A valid, finishable level has at least one flower.

**Intersection**:
A place where ground polygon edges intersect, including an edge intersecting
another edge of the same polygon.
_Avoid_: Crossing

**Library**:
The collection of built-in shapes and saved reusable level content.

**Library item**:
A reusable arrangement of duplicable level content, such as polygons, objects,
pictures, textures, and colors.
_Avoid_: Custom shape, stamp, preset
