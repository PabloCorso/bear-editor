# Picture, texture and color workflows

Bear keeps **Picture**, **Texture** and **Color** as three recognizable tools.
Each picker offers **Place** and **Fill** without adding extra toolbar buttons.
The tool's existing shortcut activates Place; choosing Fill changes the active
mode while keeping its selected asset, distance and clipping.

- **Place** inserts one ordinary Elma picture or texture at the pointer.
- **Texture Fill** creates automatic combinations of standard LGR mask pictures
  over a polygon. It never changes the underlying polygon.
- **Picture Fill** repeats an ordinary LGR picture across a target polygon.
  The repetition uses the sprite's rectangular footprint, not its alpha outline.
- **Color Fill** repeats the chosen LGR color picture (usually a `zzRRGGBB`
  sprite) over the polygon; it does not change physical terrain color.

All fills preview on hover and apply as one undoable action. Existing scenery is
not removed. A fill follows the polygon's approximate bounds, not an exact
polygon-clipping primitive: images and masks can extend beyond irregular edges.
For a picture whose transparency leaves gaps, repeated tiles retain those gaps.
Large/complex polygons can be rejected rather than partially filled. Standard
Elma .lev pictures remain editable, selectable and serializable.

## Replace selection

Selection **More actions → Replace selection…** offers Apple/Killer/Flower,
Picture, Texture, Color tile, and Copied content using the same asset
presentation where applicable. Replacement occurs at each selected vertex or
element anchor, not by resizing one item to the selection. Selection replacement
removes originals and is undoable in a single step. The protected level start
is excluded. Color tiles are picture elements, not polygon properties.

## Convert a picture

Select exactly one ordinary LGR picture, then choose
**More actions → Convert picture…**. Two output modes are available:

- **Polygon** traces its alpha boundary into editable terrain polygons.
- **Polygon + texture** also fills the traced outer polygons with ordinary
  standard texture masks chosen from the shared picker.

The original picture is removed. Tiny alpha islands below four square pixels
are omitted; high-detail or exceptionally large sprites can be rejected safely
before any edit. Inner holes create nested polygons where possible. This is
approximate vector tracing with a 50% alpha threshold and contour simplification,
not a pixel-perfect terrain representation. Generated polygons affect physics;
the textured variant may spill slightly around their boundary. Both options
commit as one undo step and preserve regular .lev serialization.

The same conceptual separation applies throughout: choose the **content**
(picture, texture or color), choose the **operation** (Place, Fill or contextual
Replace/Convert), and act on the canvas or selection. No new file format or
universal tool abstraction is introduced.
