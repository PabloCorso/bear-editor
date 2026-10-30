// EOL public source f12a1f6 (2026). Keep versioned compatibility rules here,
// separate from editor geometry tolerances. See docs/topology-checks.md.
export const EOL_LEVEL_LIMITS = {
  polygons: 1200,
  vertices: 20000, // Ground AND grass.
  // SLE keeps the long-standing per-polygon compatibility limit even though
  // current EOL only caps the total number of vertices.
  verticesPerPolygon: 1000,
  objects: 252, // Includes the actual level start and every flower.
  pictures: 5000, // Pictures and masked textures share the same file array.
  dimension: 188,
  objectBorder: 1,
} as const;
