# Roadmap

Planned features and feedback for Bear Editor.

## Planned features

- @Tarogato i concern that being able to move polys by edge without selection could interfere with grabbing pictures and masks
  - hotkeys to toggle select only poly / only pic / only mask / only fans / grass / object

- More vertex tool options or new polygon tools
  - Continuable pipes: automatically join a new pipe when it starts close enough to an existing pipe. @iCS
  - Experimental
    - Text number sequence tool.
    - Roller coaster tool

- Further topology repair options
  - Explore previewed simplification, polygon-operation repairs and object relocation where the intended result is clear.

- Faster loads
  - Investigate the initial HTML response delay, then evaluate a static or prerendered editor shell or HTML caching.
  - Use the existing `elmajs` ESM build to enable tree shaking, with browser and SSR validation.

## Known issues

- **Chrome button hover flicker — investigate later.** Reproduced on Chrome 155 / macOS 26.6.2 (Apple M2), including Incognito; not reproduced in Safari. Continuous canvas redraws trigger it even in a standalone WebGL/Canvas 2D page; pausing redraws or hiding the canvas stops it. Frozen sprite frames still flicker. Button primitives, transitions, toolbar opacity, paint containment, WebGL alpha and antialiasing changes did not resolve it. Disabling Skia Graphite left Chrome's GPU unavailable after crashes, so it is not a confirmed fix. All editor experiments reverted; cause unresolved.

## Other

- Custom lev folder management with preview thumbnails
- Multi-player level editor
  - Follow a designer's view while editing; explore following them in play mode too.
  - Chain level working areas: let different designers build separate parts, with optional locks to prevent edits by others and optional hiding to keep parts secret until revealed.
- Import level
- History playback: scrub backward and forward through the existing undo/redo history with a slider, or press play to replay edits sequentially for fun. Could also help show who changed what in multiplayer editing.
- Desktop build
  - Bundle the shared editor with Electron for offline use and native file access; download updates in the background and offer Restart to update when the user is ready, protecting unsaved work.
  - Keep shortcuts consistent with the web, with a few platform-specific overrides for standard desktop actions such as Cmd/Ctrl+N for a new level; show the appropriate shortcuts in menus and shortcut help.
