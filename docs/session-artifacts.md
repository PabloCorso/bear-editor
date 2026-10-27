# Session artifacts on the canvas

Session-only items, such as test players, participate in the same selection as
level objects. Storage lifetime does not determine whether an item is selectable.
Click selection, selection modifiers, marquee selection, Select All, hover,
selection outlines, transforms, and context menus use the regular select tool.

`app/editor/session-artifacts.ts` adapts session data into selectable point objects.
Each provider supplies a namespaced stable key, the current position, hit testing,
and selection circles. Optional `move` and `remove` handlers define supported
actions. Moving includes transforming the position in a mixed selection; it does
not resize or rotate the artifact's graphic. Unsupported actions skip the item
while processing eligible members of the selection.

The level clipboard explicitly includes eligible level data, so copying or
duplicating a mixed selection skips session artifacts and the level start.
A selection containing only those items cannot be copied or duplicated. Picture
arrangement and type-specific property controls continue to target eligible items.
Test-player actions (activate, play, rename, promote) remain in their own submenu.
Enter uses a selected player as the play start only when it is the sole selection.

## Adding another artifact type

1. Keep its collection in editor session state, outside `EditorLevel`.
2. Add a provider in `session-artifacts.ts`. Give every item a unique, stable,
   namespaced key and its actual immutable position reference. Provide geometry
   and only the action handlers that the type supports. Replace positions through
   store actions rather than mutating them.
3. Include the collection in `EditorHistoryState` and
   `getEditorHistorySnapshot` so edits undo together with level edits. Reset it
   when opening a different document, as with test starts.
4. Render the artifact in the appropriate scene and add its specialized controls
   separately. Shared selection and action dispatch need no new engine branch.

Adapter results are cached per immutable editor state. Artifact identity survives
position replacement; selection history records stable keys rather than relying
on coordinates, so overlapping items remain distinct. The position-key lookup
uses weak references and does not persist artifacts.

`getEditorHistorySnapshot` includes session data for undo/redo.
`getLevelSnapshot` remains the boundary for saving, exporting, recovery, and dirty
tracking. Session edits therefore do not mark the level dirty or enter its file.
