# Changelog

All notable changes to this project will be documented in this file.

## 2026-04-06

- Add picture properties for distance and clipping.
- Add custom LGR support in level properties.
- Show boundary outlines when enabled above pictures and textures for better visibility.

## 2026-17-05

- @Labs reported that the invisible grass in the sky was confusing, so now polygon lines are visible by default to make it clearer. Split grass and ground bounds into separate visibility options.
- Simplified preference settings.

## 2026-15-05

- Migrated editor and play mode from Canvas 2D to WebGL to improve performance drastically on big levels or levels with many pictures.
- Grass rendering improvements.
- Add zoom textures setting.

## 2026-01-04

- Add mobile play mode.
- Add setting to change from Internal or SLE vertex creation style, thanks to `@Andry` for the feedback.

## 2026-29-03

- Add base play mode, thanks to `@amarshalov` for sharing elma core for web code from hide editor.
- Add base topology checks.

## 2026-03-21

- Use clipboard so that can copy/paste works cross tabs.
- Change default level including Smibu and Internal editor defaults.

## 2026-03-10

- Align vertex creation with Internal Level Editor.
- Keep Smibu Level Editor vertex creation style from edges behind mod+click.
- Add copy/paste and erase options from the select tool.
- Improve toolbars positioning and responsiveness on mobile.

## 2026-03-09

- Add "always show all vertices" kind of option `@roope`
- Improved vertex tool icons.
  - "took 10 seconds to figure out grass vertex tool" `@roope`

- Add basic texture and visibility options.
- Add visual cues for when the click for selecting things.
- Undo state can get out of sync with objects and overlay render.

## 2026-03-03

- Improve zoom controls and add pinch/touchpad zooming.
- Add selection and zoom gestures on mobile.

## 2026-02-08

- Feedback from @Isty. Remove apple gravity shortcut which conflict with select tool on S (gravity down).
- Edit apple properties on right click.
- Add grass variant to vertex tool (G shortcut).

## 2025-12-11

- Improved LGR support and added picture tool (only default distance and clipping for now).
- Update toolbars positioning, controls are back to the left side.
- Added base undo/redo feature.
- Added hand tool for panning the view.

## 2025-12-01

- Updated on feedback from `@insguy`:
  - Instead of canceling add polygon on changing tool, add it.
  - Not clear save and save as do same thing for me (just download lev) - clarified in UI (Chrome only supports file pickers).
  - Increased zoom out/in steps to reduce number of clicks.
  - Changed P (Polygon) to V (Vertex) V is more intuitive and easier to reach.
- Add default LGR support for current kuski, apples, killers and exit objects drawings.

## 2025-11-27

- First Battle by `@insguy` using the level editor: https://elma.online/battles/209393
- Fixed vertex being truncated on download, making close vertices end up with the same coordinates causing internal errors.
- Thanks to `@Markku` for identifying and reporting this issue.

## 2025-11-26

- File session now tracks file handles using [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
- Supports save/save-as via the picker with permission checks, and falls back to download when pickers are unavailable.
- Save flow now requests write permission and gracefully falls back to download when saving to disk is blocked.
- Canvas resizing is now batched and preserves the bitmap to avoid flicker while keeping the view fitted to the container.
- Chat/OpenAI toggle controls are hidden to declutter the editor UI when the feature is not in use.

## 2025-11-25

- Hid the chat button for now to declutter the editor UI.
- Updated the file session flow to align picker prompts and save handling.

## 2025-11-24

- Renamed a few editor pieces for consistency and merged AI tool work from PR #1.
- Applied a handful of polish fixes around layout and interactions.

## 2025-08-21

- Initial tests with AI assistant integration for level editing. Here is a horse made with AI:
  ![AI Horse](./docs/ai-horse.png)

## 2025-08-03

- ToolRegistry introduced for polygon, selection, and object tools.
- Built-in levels dialog with search/filter and classic desktop-focused sidebar layout.
- Large EditorEngine refactor for utility-driven event handling, camera ops, and rendering.
- Removed mobile support until the editor is more mature as it adds too much complexity at the moment.

## 2025-08-02

- Finished polygon-on-click behavior using vertex proximity
- Download and import level support.
- Hand tool with keyboard/mouse/touch panning.

- Camera panning corrected, sprite positioning tweaked, and selection deletion enabled.
- Sidebar enhanced with shortcuts, search, and better tool display; improved camera/selection handling.
- Debug mode in EditorEngine for polygon orientation, with clearer sidebar title.

## 2025-08-01

- Base level editor scaffolded (create-react-router initial commit plus core editor setup).
