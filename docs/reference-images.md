# Reference images

Use **Level options (⋮) → Import image…** to place a PNG, JPEG, or WebP in the current view. Multiple images are supported. Images are local editing references: they are not part of an Elma level, saved files, recovery snapshots, or play mode. PNG export includes them with the current editor appearance and omits them with the game appearance. Opening or creating another document clears them.

Reference images participate in Select like other canvas items. Click, modifier-click, marquee selection, and Select All can include them alongside level content. Dragging moves the complete mixed selection. The selection toolbar identifies images in its filter and provides the usual Delete and Transform actions. Transform resizes and rotates images together with the rest of a mixed selection.

Reference images render over the terrain fills but below polygon outlines, pictures, objects, and editing overlays, keeping the reference visible in both ground and sky. They remain session-only canvas items: they are excluded from the level clipboard and level undo history even when selected with level content.

Import decodes images in the browser without uploading them. Files are limited to 25 MB and 40 million decoded pixels. Large images are downsampled to a maximum texture dimension of 2,048 pixels. Failed imports leave existing images intact; imports finishing after the document has changed are discarded. Bitmaps are closed on deletion/document replacement, and cached WebGL textures are released when an image leaves the scene.

Image-to-polygon conversion is outside this feature.
