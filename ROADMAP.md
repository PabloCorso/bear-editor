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

### One room, one level

A designer opens a level and starts a room from a small top-right **Share** button. Starting explicitly uploads a copy of the current level. The designer picks a name and an Elma avatar (apple, flower, killer or rider) and copies an edit or view link. A guest opens the link in a separate document session, picks a name and lands on the same geometry. Protect any unsaved solo document before switching. The room stays usable when its creator closes their tab.

In a room, show a compact avatar stack beside Share. Tapping it opens a keyboard-accessible participant list with names, avatars, edit/play status and Follow. Draw remote cursors in world coordinates with names on activity. Collapse extra avatars into a count on narrow screens. Keep the same control reachable in play mode, where the normal editor toolbars are hidden.

### Hosting and budget

Try Liveblocks Free for a small invite-only pilot. Keep the app on Netlify. Use a short-lived Netlify Function to create rooms and authorize exact-room access. Browsers connect directly to Liveblocks for presence and persistent Storage. The creator can go offline, a later guest can still join, and Bear needs neither a separate database nor a long-lived Netlify process. Lazy-load the room code only when starting or joining.

| Approach                           | What Bear would own                                                                                                                                                                 | Decision                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Liveblocks Storage and Presence    | Bear's shared schema, invite authorization, tool adapter and UI. The service handles connections, persistence, reconnect and collaborative history.                                 | Prototype first. Its collaborative whiteboard is a close example.                              |
| Yjs with WebRTC                    | Signaling, reliable peer reachability (potentially TURN), permissions and a way to recover the latest room when all peers leave. IndexedDB only helps on the device that stored it. | Useful for an explicitly host-online session. Poor fit for a link someone can reopen tomorrow. |
| Cloudflare Durable Object per room | Hibernating WebSockets, room storage and a free tier are available. Bear would own deployment, authorization, sync integration, recovery and quota handling.                        | Revisit if the managed free allowance regularly interrupts real sessions.                      |

Liveblocks Free currently includes 3,000 connected person-minutes per month, 10 simultaneous connections and 10 MB of stored data per room. Two connected designers use the monthly minute allowance in about 25 hours together across the entire project. An exhausted feature pauses until reset. Keep the pilot on Free, disconnect on leave, and measure a representative level's encoded size, drag traffic, participant minutes and idle-tab use before exposing Share broadly. Limit room creation, reject oversized seeds before upload and keep local export available when the service is unavailable.

References: [Free limits](https://liveblocks.io/docs/pricing/plans/free), [minute accounting](https://liveblocks.io/docs/pricing/faqs), [collaborative whiteboard](https://liveblocks.io/examples/collaborative-whiteboard/nextjs-whiteboard), [Storage](https://liveblocks.io/docs/guides/how-to-use-liveblocks-storage-with-react), [room authorization](https://liveblocks.io/docs/authentication/access-token), [y-webrtc](https://github.com/yjs/y-webrtc), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

### What crosses the wire

| State             | Where it belongs                                                                                                                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Level             | One versioned room document with the full editor level, including ordered polygons and pictures, objects, the level start, metadata and saved times. Seed once before issuing invites. Preserve precision and ordering on export.                                       |
| Presence          | Display name, avatar, cursor, camera center/zoom, edit or ride mode and optional rider pose. Throttle, drop stale samples and clear on disconnect.                                                                                                                      |
| Personal session  | Selection, tools, camera controls, active test start, saved ride moments, rewind buffer, reference images and file/folder handles stay on each device. Share LGR names and picture references. A guest missing a custom LGR can supply it locally.                      |
| File and recovery | The room is the shared working copy. Anyone with access can export the visible level as a local copy. Use the existing file/download paths with a fresh destination. Keep an optional bounded IndexedDB recovery checkpoint keyed by room, separate from solo recovery. |

Room updates never implicitly write into someone's lev folder. Access to a folder is a per-device convenience. If browser storage is unavailable, show whether recovery is available and keep download working. Opening a different level starts a separate solo session or a new room. Skip building a level library for this feature.

### Editing contract

- Keep provider calls in a small collaboration module. One adapter projects room records into the existing editor store and translates completed tool transactions into mutations. The shell owns join/leave and overlays. Tools and the renderer keep using editor types. Avoid syncing the Zustand store or teaching each tool to open a socket.
- Assign stable room-only IDs to entities and vertices on seed/insert. Use ordered collections and keyed records. Make each vertex position one atomic coordinate pair. Retain IDs through movement and reordering, mint fresh IDs for paste/split outputs and strip IDs at the file boundary. Audit selection rebinding and object replacement before assuming IDs can be inferred from coordinates or array indices.
- Use the existing history gesture boundary. Preview a drag locally and publish one batch on release. Escape drops the preview. Incoming edits update the committed base while the preview is active. Concurrent edits to different vertices must both survive. For the same point, use the provider's convergent winning position. If its target is deleted, cancel the gesture. For multi-entity operations such as boolean cuts, check the input identities and revisions again before commit. Gate these tools in rooms until concurrent modifications are handled safely.
- In rooms, undo/redo shared edits through provider history scoped to the author. Never restore the editor's whole history snapshot over another person's edits. Keep personal-only actions local and sequence shared and local actions by gesture so Undo still matches user expectations. For gestures mixing both kinds, group them as one user action or disable that combination in the pilot. Remote patches must neither echo back nor enter personal undo. Prototype same-target undo after a later peer edit before enabling it.
- Validate schema versions, collection bounds and finite coordinates when loading changes. Unsupported versions offer export from a compatible client and refuse writes. Preserve the distinction between a malformed payload and valid in-progress geometry that the existing topology inspection can flag.

### Invites, disconnect and exit

Use anonymous sessions. Give the creator a separate owner credential and let them choose which link to distribute. Use opaque or server-signed capabilities in the URL fragment. Exchange them through the function for short-lived credentials restricted to the exact room and role. Enforce viewer permissions at the provider, including presence while viewing. Keep management credentials out of invites, logs and analytics. A display name grants no rights. Links can be forwarded and viewers can export what they see.

Keep room lifecycle and invite version in server-controlled metadata. Owner can end the room. Prove that ending invalidates invites, blocks reauthorization and disconnects existing writers before promising immediate revocation. Set a pilot retention policy (proposed: delete after seven days of inactivity), show it when sharing and implement cleanup before public release. Expired links offer a local recovery/export if that browser has a checkpoint. Losing the owner credential leaves the room subject to normal expiry.

Distinguish syncing, synced and reconnecting from saving a file. On connection loss, pause new shared mutations, retain the last local working copy and offer **Continue solo**. Resolve already-submitted mutations using provider reconciliation before enabling editing again. Rejoin from authoritative storage without reseeding or blindly replaying a gesture. If an unconfirmed edit cannot be reconciled, offer a separate local copy. Apply the same fallback for a full room, denied access, quota exhaustion or failed initialization wherever a local copy exists.

### Following and playtesting

Follow a participant's world-space camera center and zoom, adjusted for the follower's aspect ratio. Manual pan, zoom, editing or Escape exits follow. A departing target releases the camera. Suppress rebroadcast of camera movement caused by following so two people following each other cannot create a feedback loop.

Each rider picks a personal test start via the current test-start session. Freeze level geometry for that run. Edits from the room become playable on the next run. A saved ride moment or rewind stays local and starting from either never moves the level's actual start. A viewer can also test locally.

For play-mode follow, send a sampled rider/bike pose, camera and run identifier with its level revision. Draw an interpolated ghost, reset interpolation on restart or rewind and discard old samples. If the follower lacks the rider's revision, show that the run uses older geometry and offer camera-only follow. Avoid simulating remote inputs. When the rider returns to editing, resume following their editor camera.

### Delivery gates

1. **Private two-browser spike.** Round-trip an existing level through room storage and export, comparing geometry, order and metadata. Try Chrome plus Safari or Firefox without a file handle. Seed once, leave as creator, reopen from the link and attempt a write using a viewer credential. Verify quota and size failure paths.
2. **Shared editing pilot.** Start with move, insert, delete and paste. Exercise concurrent edits to different and identical vertices, delete during drag, undo after a peer edit, lost acknowledgments, refresh and reconnect. Compare both clients' exports. Restrict unsupported operations at every entry point, including shortcuts. Offer the pilot only once two users can complete a real editing session and recover their work.
3. **Presence and edit follow.** Exercise pointer and touch input, duplicate names, follow loops, hidden tabs, stale cursors and participant departure. Check idle traffic and narrow-screen controls.
4. **Independent test rides and spectating.** Start from two different test starts while a third person edits. Exercise rewind, restart, follow exit, geometry revision mismatch and returning to the editor. Verify the exported level retains its original start.

Defer persistent accounts, cloud project browsing and chain-level working areas with locks or hidden sections until sessions show a need for them.

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
