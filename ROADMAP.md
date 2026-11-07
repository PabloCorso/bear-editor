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

## Multiplayer editing plan

### Goal and constraints

Make it fun for a few friends to edit one Elasto Mania level together in temporary peer-to-peer sessions, with no recurring infrastructure cost. Keep the experience simple, reliable, and independent of normal solo editing. Each participant can save or export their own local level.

Start with **Yjs + WebRTC** as an experiment, not an unconditional infrastructure commitment. Yjs handles convergent shared data and awareness; y-webrtc uses signaling to introduce browsers and then attempts direct peer connections. Connection reliability depends on signaling and network reachability; validate it with real devices. The creator initiates the room, and every connected peer holds the shared document. The room can continue after they leave *while another connected peer has the document*. When everyone disconnects, the share link alone does not recover the room.

**Infrastructure:** use free WebRTC signaling for initial discovery, with direct browser-to-browser synchronization when reachable. Validate real cross-network connectivity before shipping. If relay infrastructure is required, document that blocker and reassess the scope. Isolate the transport and shared document adapters, and lazy-load collaboration code.

### Product behavior

- A small **Share** button in the top-right starts a session from the currently open level; provide an unguessable room link, with an explicit note that the session is temporary. The initiator chooses a display name and playful Elma avatar (rider, apple, flower, killer). Guests choose theirs on join. Guests join directly.
- When joining, protect the guest's current unsaved solo document before replacing the view. Joining an existing room **must never seed or overwrite it**. The initiator seeds one room document before distributing the invite; handle repeated joins and refresh without duplicating entities. Refuse editing until initial sync / initialization is verified; don't infer that an empty local Yjs document means a genuinely empty remote room.
- Everyone with the link is a **trusted editor**. Use an unguessable invite link and explain that recipients can forward it. Treat the room as a casual session among friends rather than a secure access-controlled workspace.
- Show a compact avatar stack and participant list as a later milestone. Use remote world-space cursors and names on activity, with stale presence cleared on disconnect; keep controls accessible on mobile and in play mode. Camera-follow and ride-follow are later enhancements.
- Each participant can download/export the current level through the existing file workflow. Never implicitly overwrite a local level or another participant's file/folder. Show **Session active**, **Connecting / Reconnecting** or **Offline** separately from **Saved to file**. If sync fails, preserve the local level and offer **Continue solo** or export. If edits are unconfirmed or peers disagree, prefer a separate local copy over silently overwriting another peer's changes.
- When the last participant leaves, the room is no longer available through the link alone. Explain this in the sharing UI. A bounded per-device IndexedDB checkpoint may later make local recovery easier.

### What is shared

| State | Decision |
| --- | --- |
| Level | Versioned shared Yjs document holding ordered geometry, objects, start, pictures and level metadata. Preserve original file order and coordinate precision on export. |
| Presence (later) | Name, Elma avatar, cursor, edit/ride status, camera center/zoom and optional sampled rider pose. Transient, throttled, never stored in the level file. |
| Personal | Selection, active tool, camera/input state, personal test start, ride simulation and rewind history, local reference images, LGR files and filesystem handles. |
| Local file/recovery | Independent export/save on each device; optional bounded local checkpoint, clearly distinct from the room. |

### Editing architecture and correctness

- Keep collaboration isolated in a small module: document schema, transport provider, awareness and a bridge to existing editor types/store. Reuse existing tools and renderer through the bridge instead of synchronizing the entire Zustand store. First inspect actual store, history and tool transaction boundaries; adapt to them with minimal changes.
- Give room entities and vertices stable IDs. Use keyed records and explicit ordering; treat a vertex position as one atomic coordinate pair. Preserve IDs on movement, give new IDs to inserted/pasted/split geometry, and strip room-only IDs when exporting `.lev`. Do not identify entities by array index or current coordinates.
- Use existing gesture boundaries: previews during pointer movement remain local, and commit a batched shared transaction on release. Cancel preview on Escape. Incoming remote edits must not be echoed back into Yjs. Concurrent edits to different vertices must survive; same-point changes converge deterministically, and deletion of a target cancels an active gesture. Test reordering and polygon mutations for correct concurrent behavior.
- Shared undo/redo must be scoped to the initiating author (investigate Yjs `UndoManager` origins/scopes); never restore a whole prior level snapshot over remote edits. Keep local-only history separate. If correct shared undo is not ready, clearly disable it in collaborative sessions until the behavior is safe. Gate any unadapted editing command (including keyboard shortcuts and paste) and explain that the tool isn't available in collaborative mode. Normal solo editing is unchanged.
- Validate schema/version and finite coordinates on import/sync. Different application versions must not silently corrupt room data. Keep live in-progress geometry distinct from malformed state.
- Keep performance bounded: synchronize meaningful commits rather than every rendered frame or pointer movement. Test large real levels and the eventual presence/pose update rate.

### Playtesting and following (later milestones)

Each participant can test locally using a personal test start, with their ride state and rewind remaining local. A run uses a frozen geometry snapshot; collaborative changes apply to the next run. Neither personal test starts nor rewind alter the level's real start.

Follow a designer by broadcasting world-space camera center/zoom; manual navigation, editing or Escape exits follow. Avoid camera-follow feedback loops. Spectating a rider requires sampled bike pose, run identifier and geometry revision, interpolation and resets for restart/rewind. If revisions differ, fall back to camera-only follow. Synchronize sampled rider poses rather than replaying remote inputs. Build this after the editing MVP.

### Small, gated delivery plan

1. **Connectivity spike.** In a separate implementation PR, open two distinct browsers (including mobile or Safari) on different real networks and establish a room via a copied link. Transfer a representative real level exactly once, edit one polygon/vertex on each side, converge, and export an identical `.lev` (geometry, ordering, metadata, precision). Test creator departure while a peer remains, both peers leaving, refresh, reconnect, and an unreachable signaling/peer connection. Measure cross-network connection reliability and whether a relay is necessary. Document results and blockers before advancing. Use minimal developer-facing UI.
2. **Safe editing MVP.** Only after the spike passes: minimal Share/join UI, names (avatars optional), clear temporary-room status, safe join/leave and solo export; move/add/delete/paste only after each tool is properly bridged; correct conflict handling and author-scoped undo or explicit undo restriction. Test same/different vertex edits, deletion during drag, refresh, disconnect, file export, keyboard shortcuts, unsupported commands and guest unsaved-work protection. Keep scope small and shipable.
3. **Presence and follow.** Add compact Elma avatars, participant list, world-space cursors and edit-camera following with touch-friendly UI and throttling. Treat as independent enhancement.
4. **Independent rides and spectating.** Keep each test start/rewind local; add ride status and, only if useful, interpolated ghost and play-mode follow. Treat as independent enhancement.

Implementation agents should **deliver one milestone at a time**, with tests and a short account of results and compromises. Keep later features independent of earlier milestones.

References: [Yjs](https://docs.yjs.dev/), [y-webrtc](https://github.com/yjs/y-webrtc), [Yjs UndoManager](https://docs.yjs.dev/api/undo-manager), [WebRTC connectivity](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols).

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
