# Smooth tool

Select Smooth in the Vertex toolbar, hover a polygon edge, and click to apply
its outline preview. The vertex handles show the resulting polygon. The active
tool controls show its original and resulting vertex counts. Each click is one
undoable edit; hovering or changing the amount does not modify the level.

Use + (or =) and - to adjust Amount, or click the matching buttons.

- Positive values (1–5) round corners with Chaikin subdivision. Each pass replaces
  every edge with points one quarter and three quarters along it, joining these
  points across the old corners. This doubles the vertex count per pass and
  gradually shrinks the polygon toward a rounded outline.
- Zero leaves the polygon unchanged.
- Negative values (-1 through -5) simplify the outline with
  Ramer–Douglas–Peucker. Two open arcs cover the entire closed polygon, including
  its closing edge. The tolerance starts at 0.5% of the polygon bounding-box
  diagonal and doubles at each negative step. Larger tolerances remove more
  detail while retaining the remaining vertices at their original positions.

Simplifying is not an inverse of rounding. Use Undo to restore the exact previous
shape. Merely inserting vertices along straight edges would add detail without
rounding any corners, which is why positive values also change the outline.

The preview always starts from the polygon currently in the level. A second
click applies another operation to the result of the first. Grass polygons keep
their grass property; open two-vertex grass lines are not targets.

Subdivision stops at 2,048 vertices per polygon. Larger input polygons are not
processed. Results with fewer than three vertices, negligible area, reversed
winding, overlapping vertices, or self-intersections are rejected. The active
tool info explains limits and rejected results. As with other geometry edits,
use the level topology check to inspect interactions with neighboring polygons;
Smooth does not move those polygons or enforce spacing between them.
