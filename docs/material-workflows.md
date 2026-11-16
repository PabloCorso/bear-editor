# Picture, texture and color workflows

Bear keeps **Picture**, **Texture** and **Color** as three recognizable tools.
Use their toolbar pickers to place individual assets. To fill one or more
selected polygons, choose **More actions → Fill** and pick Picture, Texture, or Color.

- **Texture Fill** creates automatic combinations of standard LGR mask pictures
  over a polygon. It never changes the underlying polygon.
- **Picture Fill** repeats an ordinary LGR picture across a target polygon.
  The repetition uses the sprite's rectangular footprint, not its alpha outline.
- **Color Fill** repeats the chosen LGR color picture (usually a `zzRRGGBB`
  sprite) over the polygon; it does not change physical terrain color.

Fill applies to the selection as one undoable action. Existing scenery is
not removed. A fill follows the polygon's approximate bounds, not an exact
polygon-clipping primitive: images and masks can extend beyond irregular edges.
For a picture whose transparency leaves gaps, repeated tiles retain those gaps.
Large/complex polygons can be rejected rather than partially filled. Standard
Elma .lev pictures remain editable, selectable and serializable.

## Replace selection

Selection **More actions → Replace** offers Object, Picture, Texture, Color,
and Clipboard. Under Object, choose Apple, Killer, or Flower. Replacement occurs at each selected vertex or
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
