# LGR assets

The editor resolves a level's LGR by name (case-insensitive): the configured LGR
folder, an individually imported file, then bundled `Default.lgr` for preview.
Using a preview fallback never changes the LGR name or asset references saved in
the level. Folder access is read-only; browsers may require reconnecting after a
restart. Importing files remains available without directory-picker support.

The existing bundled `app/assets/lgr/Default.lgr` is retained.

Standard asset entries remain visible even when absent. Additional pictures,
textures and masks come from LGR declarations. Custom mask names survive level
import and export. Missing references remain editable and are summarized in level
properties; they are never replaced or removed automatically.
