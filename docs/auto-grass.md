# AutoGrass corner clearance

AutoGrass joins consecutive floor edges with sky above and ground below, up to
about 61 degrees. End inset is measured along the joined grass line, including
short segments. Interior joins stay continuous.

At each end, use the larger of the user's End inset and the corner clearance.
Clearance is never added on top of an inset that already provides enough room.
Runs consumed by their two end insets are omitted.

## Local corner checks

Look at the next three connected polygon edges beyond each end. Stop when an
edge leaves the relevant grass band or another floor in the run is reached.
Project the sky-side part of each wall or inward roof onto the grass line;
this makes the required clearance vary continuously with its angle. Horizontal
continuations at the source floor height and walls on the ground side add no
clearance.

The grass line is offset perpendicular to the floor by the Height setting.
The calculation accounts for that offset, including its sideways movement on
slopes. It uses a 40-pixel upper band, a 10-pixel right overhang margin, and one pixel
of left rounding room. The right margin allows a little sprite overlap to
keep corner gaps visually small.
The textured renderer always places sprites from left to right, regardless of
polygon winding.

Corner checks only move run endpoints. They do not cut holes under unrelated
roofs or obstacles elsewhere in the level. The initial sky/ground surface check
can still split a floor where its actual surface is blocked or no longer
supports grass. Surface probes normally use an eight-pixel offset, reduced
near the source polygon's other edges so they cannot jump across a thin tip
and mistakenly trim an otherwise valid floor.

This is a local corner heuristic, not a simulation of every grass sprite or a
custom LGR. Generated polygons remain ordinary Elma grass polygons.

With zero End inset, the grass line contains only its distinct endpoints and
interior joins. A straight run has two vertices. With nonzero End inset, the
final endpoint is repeated to mark an open grass line for the renderers.
Topology checks allow decorative grass vertices to overlap and grass edges to
cross themselves or other polygons.
