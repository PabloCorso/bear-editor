# Transactional editor history

Status: accepted

## Decision

Keep Zustand for editor state. Use the editor-owned transaction service in
`app/editor/history/` for undo and redo. Remove Zundo,
time-based recording, private middleware calls, and parallel selection stacks.

A history entry is one user action with a stable semantic kind, ID, timestamp,
derived display label, optional tool ID, and immutable before/after snapshots. A
cursor points between entries. History retains at most 200 entries by default
(`historyLimit` is configurable when creating a store). Editing after undo discards
the future only when a changed action commits. Unchanged actions, selection changes,
and cancellation preserve redo.

Each snapshot contains both editable content and selection context. Selection uses
exact references into that snapshot's immutable content, not coordinate matching.
This distinguishes overlapping vertices and pictures without adding editor IDs to
Elma data or building a second identity system. Replacing a polygon while keeping
its vertices can rebind selection through vertex identity. Tools replacing positions
must update selection in the same transaction.

`EditorHistoryContent` is the authoritative undoable state seam. Adding an editable
field there makes capture and restore fail type-checking until history handles it;
transient editor fields remain outside it deliberately. All stored content and
selection references are immutable.

Undo applies the undone entry's **before** snapshot, including the selection at the
start of that action. Redo applies its **after** snapshot. Jumping to an entry applies
its after snapshot; the starting row applies the earliest retained before snapshot.
Selection-only activity between edits therefore does not introduce extra undo steps.

## State boundaries

- Editable content includes level data, reference images, and test starts.
- Selected vertices, objects, and pictures are contextual, not separate edits.
- Draft geometry, hover, menus, and gesture state are transient.
- Camera, preferences, file handles, saving state, and document origin stay outside
  history. Restores do not overwrite them.
- Dirty tracking, export, and recovery still use `getLevelSnapshot`. Session-only
  edits can be undone without marking the level file dirty.

Reference-image bitmaps stay alive while the canvas, an active transaction, or any
retained entry needs them. Branch replacement, history trimming, document replacement,
and explicit disposal release unreferenced bitmaps. Undo must never restore a closed
bitmap. GPU texture lifetime remains owned by the renderer.

## Adding an editing action or tool

Domain mutation actions in `editor-store.ts` have explicit fallback action kinds. These
produce one entry when called alone and join an active transaction when composing a
larger action. Add each new content action to the typed action map. Plain `setState`
is for UI plumbing, loading, restoration, or mutations explicitly inside a
transaction.

For a completed operation, use `Tool.edit` (or `store.history.execute` outside tools).
Action kinds and their labels are defined centrally in
`editor-history-actions.ts`:

```ts
this.edit("polygon.create-pipe", () => {
  // Include every content mutation AND the resulting selection here.
  actions.setPolygons(polygons);
  actions.setApples(apples);
  setSelection(selection);
});
```

For live manipulation, keep the transaction handle across events:

```ts
// After resolving selection, before modifying geometry.
this.editing = this.beginEdit("selection.move");

// Pointer movement updates the live canvas inside the open transaction.
this.editing.update(() => moveSelection(position));

// Completion atomically applies the release position, then captures once.
this.editing.complete(() => moveSelection(releasePosition));

// Cancellation restores the complete before snapshot and creates no entry.
this.editing.cancel();
```

A tool should implement `cancelInteraction` to discard its gesture/drafts and reset
private interaction caches. Select preserves its selection when cancelling; `clear`
also deselects. Escape, pointer cancellation, lost capture, window blur, document
replacement, and engine teardown must not leave an open gesture. `isInteracting`
lets the shared Undo control recognize uncommitted tool drafts.

Lost pointer capture is terminal according to button state: with no buttons pressed
it completes the gesture from that event, covering release/capture ordering races;
with a button still pressed it is a genuine interruption and cancels the gesture.

Draft-only tools keep previews outside editable content, then call `edit` once when
the operation is accepted. A multi-click polygon is not one transaction per click.
Do not wrap every pointer event automatically: the tool defines the action boundary.

Only one live transaction can own the document. Explicit user actions cannot nest
inside another action's mutation: attempting that throws and rolls the outer action
back. A separate UI action supersedes and cancels an unfinished gesture before it
starts. History-aware domain mutation methods use the internal `record` path, which
joins the active action or creates their specific fallback action when called alone.
This prevents an unrelated user action from being silently relabelled as part of a
gesture. A failed update rolls the action back. Completed/cancelled handles cannot
complete later, and stale updates throw. Undo/redo during a live transaction cancels
it first without consuming a committed entry. History navigation discards tool drafts
and resets transient selection frames before restoring state.

Transactions are synchronous. Finish asynchronous calculations before opening one,
verify the originating document is still active, then commit the completed result.
Do not leave transactions open while awaiting clipboard reads, imports, fonts, or
future AI generation.

## Undo, redo, and limits

The reactive history store exposes entries, cursor, active action, and undo/redo
availability. Undo and redo share the same snapshot restoration path. No direct
timeline navigation is exposed in the user interface.

This is bounded, in-memory, single-user history. Unchanged immutable data is shared;
we do not deep-clone the entire level per frame or replay tool commands. Persistence,
automatic playback, branching trees, and collaborative undo remain separate features.
If measured memory use warrants patches/checkpoints, they can replace storage behind
the existing transaction API without changing tool boundaries.
