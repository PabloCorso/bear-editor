# Grid snapping in tools

Tools keep raw world coordinates for hit testing, hovering, choosing existing
geometry, and marquee selection. Do not snap EventContext.worldPos or the stored
mouse position globally.

## Placing geometry

Use the inherited `Tool.snapPosition(position, bypass?)` for new positions.
Pass `event.altKey` during pointer or keyboard events; omit it in previews to use
the modifier state maintained by EditorEngine. Explicit false overrides a stale
modifier state, and blur clears the stored bypass.

Use the same calculation for drafts, overlays, movement, and every commit path
(click, pointer release, and keyboard confirmation). Keep stored construction
points fixed when modifiers or settings change; snap only the current endpoint.

## Moving geometry

Use `Tool.snapTranslation(anchor, delta, bypass?)`. Keep one stable anchor and
apply the returned translation to every original point. Never round individual
points in a selection, which would distort geometry and relative spacing.
Shift-constrained vertex movement retains its directional constraint instead of
grid snapping.

## Tool policy

| Operation                                              | Grid policy                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| Vertices, pipe control points, Cut & Connect endpoints | Snap new positions                                               |
| Apples, killers, flowers, pictures, textures, colors   | Snap placement and preview                                       |
| Selection movement, including transform-frame movement | Snap shared translation                                          |
| Draw and Brush                                         | Raw coordinates throughout the stroke, including the first point |
| Frame and AutoGrass targeting                          | Raw coordinates; operate on existing geometry                    |
| Resize, rotate, skew                                   | Keep their existing transform behavior                           |

Shapes snap their construction endpoints when dragging, or their placement
center when stamping at the default or saved size. Capture hit testing and
marquee selection use raw coordinates. Generated shape vertices retain their
geometry.

Generated pipe edges, grass, frame outlines, and freehand vertices are not rounded
individually. Their width and shape must remain intact.

For a new tool, choose its policy explicitly and verify preview/commit agreement,
Alt bypass, and unchanged hit testing in the existing relevant test suite.
