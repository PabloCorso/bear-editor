# Smooth tool

Select Smooth in the Vertex toolbar, hover a polygon edge, and click to apply
its outline preview. The vertex handles show the resulting polygon. The active
tool controls show its original and resulting vertex counts. Each click is one
undoable edit; hovering or changing a setting does not modify the level.

Use + (or =) and - to adjust the amount. Use [ and ] to adjust Offset, or use
either setting's buttons.

- Positive values (1–5) round corners with Chaikin subdivision. Each pass replaces
  every edge with two points positioned by Offset, then joins them across
  the old corners. This usually doubles the vertex count per pass and gradually
  shrinks the polygon toward a rounded outline.
- Zero leaves the polygon unchanged.
- Negative values (-1 through -5) simplify the outline with
  Ramer–Douglas–Peucker. Two open arcs cover the entire closed polygon, including
  its closing edge. The tolerance starts at 0.5% of the polygon bounding-box
  diagonal and doubles at each negative step. Larger tolerances remove more
  detail while retaining the remaining vertices at their original positions.

Offset ranges from 50% to 100% and defaults to 75%, which matches the previous
fixed smoothing position. Lower values pull the new vertices farther from the
old corners. At 100%, rounding leaves the polygon unchanged. Offset does not
affect simplification.

Simplifying is not an inverse of rounding. Use Undo to restore the exact previous
shape. Merely inserting vertices along straight edges would add detail without
rounding any corners, which is why positive values also change the outline.

The preview always starts from the polygon currently in the level. A second
click applies another operation to the result of the first. Grass polygons keep
their grass property and use the same closed-ring operation as ground polygons.

Subdivision stops at 2,048 vertices per polygon. Larger input polygons are not
processed. Ground results with fewer than three vertices, negligible area,
reversed winding, overlapping vertices or self-intersections are rejected.
Grass results need at least two vertices. As with other geometry edits, use the
level topology check to inspect interactions with neighboring polygons; Smooth
does not move those polygons or enforce spacing between them.
