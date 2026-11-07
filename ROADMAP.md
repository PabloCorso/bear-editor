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

Make it fun for a few friends to edit one Elasto Mania level together without accounts, paid subscriptions, or hosting a permanent multiplayer backend. Prefer a small, trustworthy feature over reproducing every Liveblocks capability. **A temporary collaborative session, not a cloud level library.** Keep normal solo editing unaffected, and make saving/exporting a local level the user's responsibility. Never claim a room is permanently saved.

Start with **Yjs + WebRTC** as an experiment, not an unconditional infrastructure commitment. Yjs handles convergent shared data and awareness; y-webrtc uses signaling to introduce browsers and then attempts direct peer connections. A public signaling server is not a guaranteed production service, and some networks require a TURN relay. The creator is a convenient session initiator, **not** a browser-based authoritative server or a required permanent host. The room can continue after they leave *while another connected peer has the document*. When everyone disconnects, the share link alone does not recover the room.

**Budget rule:** no Liveblocks minutes, paid service, persistent server, accounts or hosted database in the first implementation. If reliable cross-network connections require paid TURN or managed infrastructure, record the limitation and stop before committing to a public rollout. A small free-tier relay may be reconsidered later, but don't silently introduce one. Keep networking and shared document adapters isolated so changing transport won't require rewriting editing tools. Lazy-load collaboration code.

### Product behavior

- A small **Share** button in the top-right starts a session from the currently open level; provide an unguessable room link, with an explicit note that the session is temporary. The initiator chooses a display name and playful Elma avatar (rider, apple, flower, killer). Guests choose theirs on join. No sign-in.
- When joining, protect the guest's current unsaved solo document before replacing the view. Joining an existing room **must never seed or overwrite it**. The initiator seeds one room document before distributing the invite; handle repeated joins and refresh without duplicating entities. Refuse editing until initial sync / initialization is verified; don't infer that an empty local Yjs document means a genuinely empty remote room.
- Everyone with the link is a **trusted editor** in the initial version. No view-only link, owner credential, bans, secure role claims, revocation or room expiration backend. A secret/unpredictable URL helps avoid accidental discovery but is not strong access control, and an invite can be forwarded. Don't advertise privacy or enforcement that P2P cannot guarantee.
- Show a compact avatar stack and participant list as a later milestone. Use remote world-space cursors and names on activity, with stale presence cleared on disconnect; keep controls accessible on mobile and in play mode. Camera-follow and ride-follow are later enhancements.
- Each participant can download/export the current level through the existing file workflow. Never implicitly overwrite a local level or another participant's file/folder. Show **Session active**, **Connecting / Reconnecting** or **Offline** separately from **Saved to file**. If sync fails, preserve the local level and offer **Continue solo** or export. If edits are unconfirmed or peers disagree, prefer a separate local copy over silently overwriting another peer's changes.
- If the last participant leaves, the session may be lost. Don't show a promise that the link will work tomorrow. Optional per-device IndexedDB checkpoints can help one device recover its own copy but aren't cloud room persistence. No retention scheduler, project browser or automatic cross-device recovery.

### What is shared

| State | Decision |
| --- | --- |
| Level | Versioned shared Yjs document holding ordered geometry, objects, start, pictures and level metadata. Preserve original file order and coordinate precision on export. |
| Presence (later) | Name, Elma avatar, cursor, edit/ride status, camera center/zoom and optional sampled rider pose. Transient, throttled, never stored in the level file. |
| Personal | Selection, active tool, camera/input state, personal test start, ride simulation and rewind history, local reference images, LGR files and filesystem handles. |
| Local file/recovery | Independent export/save on each device; optional bounded local checkpoint, clearly distinct from the room. |

### Editing architecture and correctness

- Keep collaboration isolated in a small module: document schema, transport provider, awareness and a bridge to existing editor types/store. Avoid syncing the entire Zustand store, making tools network-aware or replacing the renderer. First inspect actual store, history and tool transaction boundaries; adapt to them with minimal changes.
- Give room entities and vertices stable IDs. Use keyed records and explicit ordering; treat a vertex position as one atomic coordinate pair. Preserve IDs on movement, give new IDs to inserted/pasted/split geometry, and strip room-only IDs when exporting `.lev`. Do not identify entities by array index or current coordinates.
- Use existing gesture boundaries: previews during pointer movement remain local, and commit a batched shared transaction on release. Cancel preview on Escape. Incoming remote edits must not be echoed back into Yjs. Concurrent edits to different vertices must survive; same-point changes converge deterministically, and deletion of a target cancels an active gesture. Test reordering and polygon mutations rather than assuming a CRDT makes those operations semantically safe.
- Shared undo/redo must be scoped to the initiating author (investigate Yjs `UndoManager` origins/scopes); never restore a whole prior level snapshot over remote edits. Keep local-only history separate. If correct shared undo is not ready, **disable undo in collaboration with a clear explanation**, not a dangerous partial implementation. Gate any unadapted editing command (including keyboard shortcuts and paste) and explain that the tool isn't available in collaborative mode. Normal solo editing is unchanged.
- Validate schema/version and finite coordinates on import/sync. Different application versions must not silently corrupt room data. Keep live in-progress geometry distinct from malformed state.
- Keep performance bounded: synchronize meaningful commits rather than every rendered frame or pointer movement. Test large real levels and the eventual presence/pose update rate.

### Playtesting and following (later milestones)

Each participant can test locally using a personal test start, with their ride state and rewind remaining local. A run uses a frozen geometry snapshot; collaborative changes apply to the next run. Neither personal test starts nor rewind alter the level's real start.

Follow a designer by broadcasting world-space camera center/zoom; manual navigation, editing or Escape exits follow. Avoid camera-follow feedback loops. Spectating a rider requires sampled bike pose, run identifier and geometry revision, interpolation and resets for restart/rewind. If revisions differ, fall back to camera-only follow. Never try to synchronize bike physics by replaying remote input. **None of this blocks the initial collaboration release.**

### Small, gated delivery plan

1. **Connectivity spike — no product launch.** In a separate implementation PR, open two distinct browsers (including mobile or Safari) on different real networks and establish a room via a copied link. Transfer a representative real level exactly once, edit one polygon/vertex on each side, converge, and export an identical `.lev` (geometry, ordering, metadata, precision). Test creator departure while a peer remains, both peers leaving, refresh, reconnect, and an unreachable signaling/peer connection. Measure whether free signaling works acceptably and whether TURN is needed. If not reliable, stop and document results rather than quietly adding paid services. No polished UI required.
2. **Safe editing MVP.** Only after the spike passes: minimal Share/join UI, names (avatars optional), clear temporary-room status, safe join/leave and solo export; move/add/delete/paste only after each tool is properly bridged; correct conflict handling and author-scoped undo or explicit undo restriction. Test same/different vertex edits, deletion during drag, refresh, disconnect, file export, keyboard shortcuts, unsupported commands and guest unsaved-work protection. Keep scope small and shipable.
3. **Presence and follow.** Add compact Elma avatars, participant list, world-space cursors and edit-camera following with touch-friendly UI and throttling. Treat as independent enhancement.
4. **Independent rides and spectating.** Keep each test start/rewind local; add ride status and, only if useful, interpolated ghost and play-mode follow. Treat as independent enhancement.

**Out of scope for now:** durable always-online rooms, cloud project storage, authentication, view/edit roles, server-side invite revocation, locks, private chain-level workspaces, persistent room history and guaranteed connectivity on all networks. Revisit based on real usage rather than designing for hypothetical scale.

Implementation agents should **deliver only one gate at a time**, with tests and a short written account of compromises. Do not start building later milestones as prerequisites, and don't create infrastructure before the connectivity spike proves we need it.

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
