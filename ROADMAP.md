# Roadmap

Ideas and plans for Elma Web Editor.

## Feedback

- Labs thought an invisible grass in the sky was a bug, better make that easier to understand somehow.
  - Could make polygon lines true by default.

## Planned features

- Match features set of in-game editor:
  - General help dialog
  - Pictures:
    - Right click to select picture or mask with texture and left click to place.
    - Right click the picture or texture to set properties.
    - Normal picture
      - Show OTHER: 999 G
      - Edit picture properties
    - Mask with texture
      - Masks: maskbig, maskhor, masklitt, masktop
      - brick 750 G
      - ground 800 G
      - sky 800 S
      - stone1 750 G
      - stone2 750 G
      - stone3 750 S
      - qgrass ?
  - Level properties:
    - LGR file
  - Zoom level info.

- Better save safety.
  - **Save state to local storage** and show a recover message on init. One entry per tab and show a dialog with recover or clear up saved state.

- Help section / keyboard shortcuts reference

- AI Assistant

- More vertex tool options or new polygon tools
  - **Move vertex with shift along the edge**
  - Resize polygons
  - Pipe tool
  - Roller coaster tool
  - Frame tool
  - **Auto-grass**
  - Shapes
  - Cut/connect
  - Smoothen
  - Draw
  - Text
  - Merge/subtract polygons
  - Image to polygon

- Play mode
  - WebGL for performance.
  - **Bike assets**

- Custom LGR support
  - Add support for 1-9 food animation numbers. Default LGR use 1-2, use modulo for higher numbers.

- Topology check improvements and completeness
  - Polygons, vertices and object limits
  - Help find objects inside polygons as warnings
  - Show level maximum boundaries
  - Automatic or action to fix issue when possible

- **Faster loads**

## Other

- Custom lev folder management with preview thumbnails
- Switch Level / Graphics design modes (toggle pics/grass visibility and show different toolbar)
- Multi-player level editor
- Version history info
- Export to SVG
