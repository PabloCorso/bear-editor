# Measure tool

An experimental tool for comparing slope and distance while designing levels.
Select the ruler in the left toolbar or press **M**.

- Hover an edge to preview its measurement; click to keep it. Near a vertex,
  clicking starts a free ruler instead, so endpoints are easy to pick.
- Click two points for a free ruler. Nearby visible polygon vertices snap within
  10 screen pixels. Hold **Alt** to bypass snapping and edge picking.
- Hold **Shift** while drawing or adjusting an endpoint to constrain the ruler
  to horizontal or vertical, whichever is closer. This constraint takes priority
  over vertex snapping.
- Click a ruler to select it. Drag either endpoint to adjust it.
- **Escape** or **right click** cancels an unfinished ruler or endpoint edit.
  Escape with no pending edit returns to Select.
- **Delete / Backspace** removes the selected ruler. The bottom tool hints also
  provide Delete and Clear all buttons.

Every ruler shows its length in level coordinate units and its angle from
horizontal. The active or hovered ruler additionally shows width, height, the
complementary angle from vertical, a horizontal reference line and an angle arc.
Angles range from 0 to 90 degrees and do not depend on endpoint order. Width and
height are absolute distances, not signed displacement. Values are displayed to
2 decimal places for distances and 1 decimal place for angles; endpoints retain
full coordinate precision.

Completed rulers remain when changing tools or entering play mode, and appear
only while Measure is active in edit mode. They are independent coordinate
snapshots: editing terrain does not move them. Opening or creating another level
clears them. They are never saved, copied, included in recovery data, or added to
the level's undo history, and do not mark the level as modified.

The first experiment deliberately leaves arbitrary ruler-to-edge angles,
measurements that follow terrain edits, and annotations saved between sessions
for later evaluation. Comparing measured geometry still needs play testing to
judge route difficulty.

## Try it manually

1. Measure a horizontal edge, a vertical edge and an uphill edge. Check their
   lengths and 0 / 90 / intermediate slope angles.
2. Draw between vertices, then hold Alt to pick nearby free points. Hold and
   release Shift without moving the pointer to check immediate constraint updates.
3. Compare several rulers. Select and remove one; use Clear all for the rest.
4. Drag an endpoint, then cancel with Escape or right click. Verify the original
   ruler is preserved. Release a drag at the opposite endpoint; the zero-length
   edit should be discarded.
5. Pan and zoom; lines, labels and hit areas should remain aligned and readable.
6. Switch tools and enter/exit play mode. Rulers should return with Measure.
7. On touch, tap two endpoints. Start a pinch during an endpoint edit to cancel
   the edit and navigate without changing the ruler.
8. Save or export a level and compare its geometry; rulers should have no effect.
   Open another level and verify there are no measurements carried over.
