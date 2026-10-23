# Roadmap

Planned features and feedback for Bear Editor.

## Planned features

- AI Assistant

- Explore a consistent pattern for tool settings access and reset; AutoGrass has an accessible settings panel, while Pipe has none.

- More vertex tool options or new polygon tools
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
  - Prioritize the initial HTML response delay. [Investigation](docs/elmajs-bundling.md#priority-relative-to-server-response-time) measured 8.7 s to first byte on the initial request versus 1.0 s on the next; confirm whether SSR function cold starts are responsible, then evaluate a static/prerendered editor shell or HTML caching. The cause and any connection to Netlify's free tier remain unconfirmed.
  - Smaller follow-up: use the existing `elmajs` ESM build to enable tree shaking. [Bundle measurements](docs/elmajs-bundling.md#measured-production-output) showed a 24.6 kB minified / 7.2 kB gzip reduction in the main editor chunk. Implementation and browser validation remain; this does not address the initial HTML response delay.

## Known issues

- **Chrome button hover flicker — investigate later.** Reproduced on Chrome 155 / macOS 26.6.2 (Apple M2), including Incognito; not reproduced in Safari. Continuous canvas redraws trigger it even in a standalone WebGL/Canvas 2D page; pausing redraws or hiding the canvas stops it. Frozen sprite frames still flicker. Button primitives, transitions, toolbar opacity, paint containment, WebGL alpha and antialiasing changes did not resolve it. Disabling Skia Graphite left Chrome's GPU unavailable after crashes, so it is not a confirmed fix. All editor experiments reverted; cause unresolved.

## Other

- Custom lev folder management with preview thumbnails
- Switch Level / Graphics design modes (toggle pics/grass visibility and show different toolbar)
- Multi-player level editor
- Version history info
- Export to SVG
- Smart Texture Fill: fill a polygon with a texture using an optimized mix of picture sizes and ground clipping, minimizing picture count and overflow onto neighbouring polygons.
- Save start position
  - Checkpoints: create, move, select for play mode, and delete multiple translucent, distinctly colored bike markers without moving the actual level start. Editor-only and session-local (not stored in Elma level files), with per-designer test starts in the future multiplayer editor.
- Import level
- Grid
  - Snap to grid
- Replace selection
  - Replace with copied content
