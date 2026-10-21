# Roadmap

Planned features and feedback for Bear Editor.

## Planned features

- Improve auto grass corners.
- Pressing Enter in some dialogs might trigger Play mode accidentally.

- AI Assistant

- More vertex tool options or new polygon tools
  - Pipe tool
  - Roller coaster tool
  - Frame tool
  - Shapes
  - Cut/connect
  - Smoothen
  - Draw
  - Text
  - Merge/subtract polygons
  - Image to polygon

- Topology check improvements and completeness
  - Polygons, vertices and object limits
  - Help find objects inside polygons as warnings
  - Show level maximum boundaries
  - Automatic or action to fix issue when possible

- Faster loads
  - Investigate making `elmajs` tree-shakeable (it currently enters the client bundle through its CommonJS barrel, bringing unused package areas with it).

## Known issues

- **Chrome button hover flicker — investigate later.** Reproduced on Chrome 155 / macOS 26.6.2 (Apple M2), including Incognito; not reproduced in Safari. Continuous canvas redraws trigger it even in a standalone WebGL/Canvas 2D page; pausing redraws or hiding the canvas stops it. Frozen sprite frames still flicker. Button primitives, transitions, toolbar opacity, paint containment, WebGL alpha and antialiasing changes did not resolve it. Disabling Skia Graphite left Chrome's GPU unavailable after crashes, so it is not a confirmed fix. All editor experiments reverted; cause unresolved.

## Other

- Custom lev folder management with preview thumbnails
- Switch Level / Graphics design modes (toggle pics/grass visibility and show different toolbar)
- Multi-player level editor
- Version history info
- Export to SVG
