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

## Multiplayer editing

Temporary shared levels use Yjs and peer-to-peer WebRTC, with public signaling and STUN. No paid service, database, TURN relay, or recurring infrastructure is configured. Collaboration code loads when Share or an invitation is opened.

The implementation is **experimental and opt-in** while cross-network connectivity remains unverified. Open the editor with `?multiplayer=1` to show Share, or set `VITE_MULTIPLAYER=true` for an evaluation deployment. Invitation links enable the join UI automatically. Keep the default gate until the release checks below pass.

### Milestones implemented

1. **Shared document and transport.** Versioned schema; stable entity and vertex IDs; atomic coordinate pairs; explicit ordering; finite-coordinate and size validation. Only the creator seeds a document. Guests wait for initialized shared data. The room survives while at least one connected participant remains; its link cannot recover an empty room.
2. **Editing and recovery.** Share/join, names, invite links, committed editing transactions, local exports, connection status, and Continue solo. Drag previews stay local; changes to different vertices merge. Remote deletions cancel unfinished gestures. Joining retains the previous document in the tab and detaches its file handle. Export the previous level or return to it from the session dialog. Opening another document requires leaving the session. Undo/redo and advanced polygon operations (smooth, frame, cut/connect, boolean operations and topology repair) are blocked at the history boundary, including shortcuts. They remain available in solo mode.
3. **Presence and follow.** Elma avatars, participant stack/list, world-space cursors, editing/riding status, throttled awareness, and camera following. Manual navigation, editing or Escape exits follow. A participant following someone else does not rebroadcast that camera, preventing loops. Presence expires after disconnect.
4. **Independent rides.** Existing local test starts, simulation and rewind remain personal. A run uses its captured geometry; restarting reads the latest shared level. A peer can follow the rider's sampled camera in the editor. Interpolated rider ghosts are deferred; camera following does not attempt to render a bike against a different geometry revision.

### Validation and release checks

Completed on 2026-11-07:

- `npm run validate`: TypeScript, ESLint and all 14 existing tests pass.
- In-memory Yjs checks: one-time initialization, full-precision different-vertex edits, same-vertex convergence, concurrent additions/reordering, deletion winning over a stale move, refresh from a remaining peer, and incompatible-schema rejection.
- `Pipo006.lev` round-trip preserves geometry, pictures, ordering and metadata. Exports match when the serializer's random header values are held constant.
- A synthetic 45,000-vertex document seeded in approximately 744 ms and read in 84 ms in this environment; its initial update was approximately 5.9 MB. These are local measurements, not a network benchmark.
- Chromium two-tab checks: Share/join, initialized sync, title edits, disabled shared undo, participant display, camera-follow/Escape, creator departure and Continue solo. These exercise the provider's same-browser channel.

Required before enabling by default:

- Two distinct browsers, including mobile Safari, on different real networks: direct WebRTC connection through public signaling, edits, export, refresh, reconnect, remaining-peer recovery and unreachable-room handling. The separate-process WebRTC check with a local signaling broker timed out in this environment; it is **not** a connectivity pass. Public signaling was also unreachable from this execution environment.
- Manual concurrent drag/deletion, paste and supported-tool checks, plus touch layout, riding/following and connection-loss recovery. The guarded runtime paths are implemented, but their complete real-device matrix is pending.
- Confirm that free signaling and direct connections provide useful reliability. If reliable connections require a paid relay, reassess delivery scope before enabling the feature.

References: [Yjs](https://docs.yjs.dev/), [y-webrtc](https://github.com/yjs/y-webrtc), [WebRTC connectivity](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols).

## Known issues

- **Chrome button hover flicker — investigate later.** Reproduced on Chrome 155 / macOS 26.6.2 (Apple M2), including Incognito; not reproduced in Safari. Continuous canvas redraws trigger it even in a standalone WebGL/Canvas 2D page; pausing redraws or hiding the canvas stops it. Frozen sprite frames still flicker. Button primitives, transitions, toolbar opacity, paint containment, WebGL alpha and antialiasing changes did not resolve it. Disabling Skia Graphite left Chrome's GPU unavailable after crashes, so it is not a confirmed fix. All editor experiments reverted; cause unresolved.

## Other

- Custom lev folder management with preview thumbnails
- Smart Texture Fill: fill a polygon with a texture using an optimized mix of picture sizes and ground clipping, minimizing picture count and overflow onto neighbouring polygons.
- Import level
- Replace selection
  - Replace with copied content
- History playback: scrub backward and forward through the existing undo/redo history with a slider, or press play to replay edits sequentially for fun. Could also help show who changed what in multiplayer editing.
- Desktop build
  - Bundle the shared editor with Electron for offline use and native file access; download updates in the background and offer Restart to update when the user is ready, protecting unsaved work.
  - Keep shortcuts consistent with the web, with a few platform-specific overrides for standard desktop actions such as Cmd/Ctrl+N for a new level; show the appropriate shortcuts in menus and shortcut help.
