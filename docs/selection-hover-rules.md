# Selection Hover Rules (Editor)

Terminology in this doc follows [Picture Terminology](./picture-terminology.md): `picture` is the umbrella term, with `sprite picture` and `texture` as the two subtypes.

## Picture / Texture hover resolution

1. `object` and `polygon` hover are resolved before picture/texture hover and keep the highest precedence.
1. Object hover has priority over polygon hover when both are under the pointer.
1. For hover resolution on pictures:
   - The candidate picture must be under the pointer bounds and selectable by visibility settings.
   - **Sprite pictures** (no `texture && mask`) are visible only on a pixel-valid area:
     - `isWorldPointInPictureVisiblePixel(...)` must be true
     - and clipping rules must allow the point.
   - Sprite pictures do not fall back to rectangular bounds in any visibility mode.
   - **Textures** (`picture.texture && picture.mask`) use two-step behavior:
     - They participate in visible-first hit-testing with the same pixel-valid + clipping rule for object-deprioritization.
     - If no visible texture pixel is found on top, they still fall back to bounds-based selection (in-bounds rectangle) so they remain clickable from their full picture area.
1. Start-object hover follows a split rule:
   - With `showObjects` enabled and kuski sprites available, start hit-testing uses the rendered kuski image geometry (wheels, frame, body, suspension, and limbs) so the full image region is clickable.
   - With object graphics hidden, start hit-testing uses collision bounds from `isPointInKuskiSelectionBounds` (head and wheel circles / triangle).
   - When a start object is already selected, re-hit-testing uses only the visible handle circles (head and wheels) so overlaid pictures/textures can win on non-bound overlap.
1. Picture hit-testing is distance aware: pictures are resolved by ascending `distance` (`0` nearest/front, `999` far/back).
1. Hovered picture state includes `distance`; picture identity for interaction and overlay rendering is resolved using `(position, distance)` to avoid selecting another picture that happens to share position.
1. Sprite pictures keep the existing region clipping behavior.

This preserves selection of the actually visible underlying item when a texture's transparent/non-rendering area is encountered.

## Interaction priority (hover vs click)

6. With both object and polygon under the pointer, the hover UI and click handling must treat the object as the active target.
7. For a selected start object, selection checks run on bounds first; only if pointer is outside those bounds do picture/texture checks take effect.

## Dragging lock

7. While a select tool drag operation is active (`isDragging`), hover updates are suspended.
8. The hover target remains unchanged during drag so that moving a selected item does not temporarily highlight underlying objects.
