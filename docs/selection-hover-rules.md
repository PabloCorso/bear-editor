# Selection Hover Rules (Editor)

Terminology in this doc follows [Picture Terminology](./picture-terminology.md): `picture` is the umbrella term, with `sprite picture` and `texture` as the two subtypes.

## Picture / Texture hover resolution

1. `object` and `polygon` hover are resolved before picture/texture hover and keep the highest precedence.
1. Object hover has priority over polygon hover when both are under the pointer.
1. For hover resolution on pictures:
   - Pictures must be selectable by visibility settings.
   - Picture selection preferences independently choose the displayed boundary (`outline` or `rectangle`), click target (`interior`, `border`, or `anchor`), and area-selection target (`bounds` or `anchor`).
   - The top-left anchor remains clickable in every mode. Border and anchor hit tests use screen-sized tolerance.
   - Rectangle and border modes do not require a visible pixel at the pointer. Border mode uses the same segments as the displayed outline or rectangle.
   - The default outline/interior mode retains these visible-pixel rules, with the anchor exception:
   - **Sprite pictures** (no `texture && mask`) are visible only on a pixel-valid area:
     - `isWorldPointInPictureVisiblePixel(...)` must be true
     - and clipping rules must allow the point.
   - In outline/interior mode, sprite pictures do not fall back to rectangular bounds.
   - **Textures** (`picture.texture && picture.mask`) use two-step behavior:
     - They participate in visible-first hit-testing with the same pixel-valid + clipping rule for object-deprioritization.
     - In outline/interior mode, if no visible texture pixel is found on top, they fall back to bounds-based selection. Border and anchor modes do not gain this interior fallback.
1. Start-object hover follows a split rule:
   - With `showObjects` enabled and kuski sprites available, start hit-testing uses the rendered kuski image geometry (wheels, frame, body, suspension, and limbs) so the full image region is clickable.
   - With object graphics hidden, start hit-testing uses collision bounds from `isPointInKuskiSelectionBounds` (head and wheel circles / triangle).
   - When a start object is already selected, re-hit-testing uses only the visible handle circles (head and wheels) so overlaid pictures/textures can win on non-bound overlap.
1. Picture hit-testing is distance aware: pictures are resolved by ascending `distance` (`0` nearest/front, `999` far/back).
1. Hovered picture state includes `distance`; picture identity for interaction and overlay rendering is resolved using `(position, distance)` to avoid selecting another picture that happens to share position.
1. Sprite picture interiors in outline mode keep region clipping behavior. Explicit anchor, border, and rectangle selection remain available regardless of clipping.
1. Boundary visibility is independent of click selection and remains controlled separately for pictures and textures. Hover and selected boundaries use the chosen shape.
1. Area selection defaults to intersection with full image bounds; an optional anchor rule requires the top-left point to be enclosed.

This preserves selection of the actually visible underlying item when a texture's transparent/non-rendering area is encountered.

## Interaction priority (hover vs click)

6. With both object and polygon under the pointer, the hover UI and click handling must treat the object as the active target.
7. For a selected start object, selection checks run on bounds first; only if pointer is outside those bounds do picture/texture checks take effect.

## Dragging lock

7. While a select tool drag operation is active (`isDragging`), hover updates are suspended.
8. The hover target remains unchanged during drag so that moving a selected item does not temporarily highlight underlying objects.
