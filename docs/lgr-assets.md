# LGR assets

The editor resolves a level's LGR by name (case-insensitive): the configured LGR
folder, an individually imported file, then bundled `Default.lgr` for preview.
Using a preview fallback never changes the LGR name or asset references saved in
the level. Folder access is read-only; browsers may require reconnecting after a
restart. Importing files remains available without directory-picker support.

The existing bundled `app/assets/lgr/Default.lgr` is retained. It contains 334
images, including 256 fancyboosted `zzRRGGBB` color pictures and `masktop`.
It is a different variant from [Elma Online's recommended default download](https://up.elma.online/u/ly8259kxy2/Default.lgr),
which contains 333 images. Its original provenance has not been established.
It is not the separate `fancy.lgr` pack.

Fancyboosting adds pictures using the LGR's palette; it does not enable arbitrary
RGB colors. The color picker uses the decoded image colors and saves ordinary
picture references. Colors has its own narrow toolbar menu, using the same
preview and property controls as Pictures. The base list contains 24 curated
colors from the decoded bundled palette, with additional light/dark shades where
useful. Other LGRs use the nearest available decoded colors for these targets.
A labeled switch at the top reveals all color pictures. The current selection remains
visible when collapsing the list, even if outside the base set.

Pictures use a responsive grid with up to six columns and horizontal row dividers.
Textures use up to four columns with dividers between material groups.
Colors use a compact grid with four columns, increasing to six when all colors
are shown and space permits. All three pickers use consistent compact padding.
Pictures retain per-item property controls and have no picker header. Colors
have the all-colors switch on the left of the fixed header and a shared
distance/clipping summary button on the right, with no horizontal separators.
Textures are grouped by material, with a distance/clipping summary button above
each row of masks, aligned to the right of the material name. These buttons open
the same settings popover as individual picture properties. Mask tiles show only
the mask name. Clipping menus only show Sky, Ground, and Unclipped; Mixed is
reserved for selections with mixed clipping. Each material starts with its own asset defaults and remembers
edits during the editor session, shared across its masks. Switching materials
restores that material’s settings. Placement settings affect future placements,
leaving existing objects unchanged.


Colors are grouped by family (neutrals, tinted greys, very dark tints, then hue
families) and sorted light to dark within each family using Oklab lightness.
Each color remembers its own distance and clipping, saved locally per LGR.
Changing those settings affects future placements, never pictures already placed.
The list has no add/change/remove controls. Earlier saved palette settings are
retained by picture name; duplicate entries use the first saved settings.

See [the complete decoded inventory and proposed base palette](color-palette-analysis.html).
Reproduce the analysis with `node scripts/analyse-color-palette.mjs`.
Players need an LGR containing those pictures to see them.
See [Elma Online's development guide](https://elma.online/lgrs/guide).

Standard asset entries remain visible even when absent. Additional pictures,
textures and masks come from LGR declarations. Custom mask names survive level
import and export. Missing references remain editable and are summarized in level
properties; they are never replaced or removed automatically.
