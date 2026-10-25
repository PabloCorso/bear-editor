# Reference images

Use **Main menu → Import image…** to place a PNG, JPEG, or WebP in the current view. Multiple images are supported. Images are local editing references: they are not part of an Elma level, saved files, recovery snapshots, or play mode. Opening or creating another document clears them.

With Select active, drag an unlocked image to move it. Selection immediately exposes four corner handles for proportional resizing and a rotation handle above the image. Resizing anchors the opposite corner. Hold Shift while rotating to snap to 15° increments. Escape or pointer cancellation restores the image before the drag; Delete/Backspace removes a focused image. Hold Shift or Alt when clicking to select level elements behind a reference instead.

Right-click an image to select it and show its controls. The Reference images panel also selects images by name, including locked or hidden images, and controls opacity, visibility, locking, and deletion. Lock a positioned image to let all canvas clicks pass through while tracing. Reference images render over the terrain fills but below polygon outlines, pictures, objects, and editing overlays, keeping the reference visible in both ground and sky. They do not participate in level selections, clipboard actions, or level undo history.

Import decodes images in the browser without uploading them. Files are limited to 25 MB and 40 million decoded pixels. Large images are downsampled to a maximum texture dimension of 2,048 pixels. Failed imports leave existing images intact; imports finishing after the document has changed are discarded. Bitmaps are closed on deletion/document replacement, and cached WebGL textures are released when an image leaves the scene.

Image-to-polygon conversion is outside this feature.
