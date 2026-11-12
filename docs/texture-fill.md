# Texture Fill

Choose Texture Fill (bucket icon beside Texture), select a texture, and hover a non-grass polygon to preview. Click to add all generated texture elements in one history update. The picker exposes only the texture, clipping, and distance. There is no manual mask choice, placement mode, or new keyboard shortcut. The innermost containing polygon wins when polygons are nested; edges can also be targeted. Hidden polygons cannot be filled when both their fill and bounds are hidden.

Generated elements are ordinary Elma masked textures, so they remain selectable, editable, and serializable through existing level operations. Filling adds elements; it does not replace earlier textures or alter geometry. Pictures and objects are outside this tool's scope.

## Placement

This is an independent adaptive rectangle-cover heuristic. SLE's Texturize was researched as a reference, but its implementation is not copied. References: [SLE controller](https://github.com/Smibu/elmanager/blob/d11baff859b4fcd4996a853be241810dd5e5bb6b/Elmanager.Core/LevelEditor/LevelEditorController.cs) and [covering algorithm](https://github.com/Smibu/elmanager/blob/d11baff859b4fcd4996a853be241810dd5e5bb6b/Elmanager.Core/Geometry/GeometryUtils.cs).

- Read each standard mask's actual dimensions and alpha from the active LGR. Find its largest fully opaque rectangle with a histogram, then inset it by one Elma pixel on every side. This supplies guaranteed opaque coverage with overlap, including transparent rows and corners. Missing or unusable masks are skipped.
- Partition the polygon bounds into cells matching the largest usable mask core. Clip the polygon to each cell to test whether coverage is needed. Concave shapes use signed intersection area, so thin features are not skipped by sampling.
- Try masks that cover the cell, shifting them within the permitted range to avoid spill. Prefer the smallest sufficient mask for each cell; the large initial cells naturally choose large masks. Larger-mask overflow is limited to a fringe area of two pixels times the footprint's width plus height.
- Subdivide boundary cells until a mask fits. The smallest usable mask is the final fallback, so arbitrarily thin or angled details may extend outside the polygon by approximately a small-mask footprint. Existing coverage is indexed in spatial buckets to skip fully covered cells.
- Abort the entire fill above 5,000 placements or a four-million geometry-work budget, and report a short message in the tool hint. Never apply a partial result. Non-finite, zero-area, grass, and crossing geometry is rejected.

Placement is cached by polygon identity, active LGR, texture, clipping, and distance. Moving inside the same polygon reuses it; polygon edits, undo/redo, document replacement, settings changes, and LGR switches resolve against current inputs. The preview does not alter the document or history. Texture Fill hides the per-mask draft outlines to keep the combined fill readable; other tools retain their draft bounds.

## Limits

The heuristic seeks low element counts, not a globally optimal cover. Masks have fixed sizes and cannot be stretched. Ground/sky clipping is global, so a finite mask extending outside the target may also texture nearby geometry. The placement algorithm considers only the target polygon, as requested, and does not promise zero spill or isolate nested regions. The preview uses the existing renderer's clipped texture and faint outside-clipping ghost so the footprint is visible. Different LGRs can have different opaque mask cores and therefore different fills.
