# Replace selection

Open the selection toolbar's more-actions menu and choose **Replace selection…**.
Choose apples (variant and gravity), killers, flowers, a picture, a texture/mask,
or copied content. Pictures and textures use the active LGR and expose distance
and clipping. Settings in the dialog are drafts until **Replace** is clicked.

Each selected vertex or element position receives one replacement. Selecting an
entire polygon therefore replaces its vertices, rather than placing one element
at the polygon's centre. Object positions are their centres; scenery positions
are their stored top-left anchors. Coincident but distinct elements remain
distinct targets. The level start is excluded and cannot be produced by this
command.

Selected originals are removed. A partially selected polygon loses only its
selected vertices, and is removed if fewer than three ground or two grass
vertices remain, matching Delete. Other polygons and unselected elements stay.
The result is selected, with one undo step for the whole operation. Undo restores
the exact source geometry; redo restores the replacement.

## Copied content

Copy one item or any mixed group with Bear's existing Copy command, then select
targets and choose Copied content. A fresh copy of the whole group is translated
to every target. It retains its size, layout, grass flags, apple properties and
scenery properties. Its anchor-bounds centre is aligned to each target, matching
ordinary cross-document paste. There is no scaling to the old selection bounds.
Copying a polygon consequently supports objects → polygon shapes.

Uses the existing versioned Bear clipboard format, including cross-tab content.
An unrelated/invalid accessible system clipboard reports an error without deleting
anything. If browser clipboard access is unavailable or denied, the last in-memory
Bear copy is used, matching ordinary paste's fallback. Replacements leave clipboard
content and ordinary paste offsets untouched. A changed document, selection, tool,
or cancelled dialog during an asynchronous clipboard read prevents replacement.

A replacement may generate at most 20,000 vertices and element anchors combined.
This is an interactive work budget, not a claim about every Elma engine's file
limits. Too-large or non-finite output is rejected before document mutation.

## Existing controls and SLE reference

Existing selection controls still cover apple variant/gravity, ground/grass,
scenery clipping/distance and stacking. Those edits retain the element type.
Replacement covers changing between types and repeating a copied group; it does
not add a duplicate property-editing toolbar or a keyboard shortcut.

SLE source inspected at commit `d11baff859b4fcd4996a853be241810dd5e5bb6b`:

- [Context menu](https://github.com/Smibu/elmanager/blob/d11baff859b4fcd4996a853be241810dd5e5bb6b/Elmanager.SLE/Editor/MainView.axaml)
  offers Convert to → Apples, Killers, Flowers, Pictures.
- [Controller](https://github.com/Smibu/elmanager/blob/d11baff859b4fcd4996a853be241810dd5e5bb6b/Elmanager.Core/LevelEditor/LevelEditorController.cs),
  `GetSelectedVertices`, `ConvertSelected`, `ConvertSelectedToObjects` and
  `RemoveSelected`, implements one result per selected vertex/object/scenery
  position, excluding the start. The Pictures path supports textures too. Apple
  conversion uses normal apples.
- No replace-with-copied-content command was found in the inspected source.
  SLE's Copy command duplicates the selection with an offset.

Bear adopts the per-position conversion semantics, adds configurable apples and
copied groups, and uses its own Delete rules for degenerate remnants. SLE retains
one original polygon if conversion would remove all polygons; Bear's existing
Delete allows zero polygons, and replacement follows that behavior. This is an
independent implementation, not a port of SLE's code.
