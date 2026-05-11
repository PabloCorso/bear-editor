type DefaultToolVariant = { name: string; shortcut: string };

export type ToolMeta = {
  id: string;
  name: string;
  shortcut: string;
  variants?: Record<string, DefaultToolVariant>;
};

export const defaultTools = {
  select: { id: "select", name: "Select tool", shortcut: "S" },
  hand: { id: "hand", name: "Hand tool", shortcut: "H" },
  vertex: {
    id: "vertex",
    name: "Vertex",
    shortcut: "V",
    variants: { grass: { name: "Grass", shortcut: "G" } },
  },
  apple: { id: "apple", name: "Apple", shortcut: "A" },
  killer: { id: "killer", name: "Killer", shortcut: "K" },
  flower: { id: "flower", name: "Flower", shortcut: "F" },
  picture: { id: "picture", name: "Picture", shortcut: "P" },
  texture: { id: "texture", name: "Texture", shortcut: "T" },
} as const satisfies Record<string, ToolMeta>;

export type DefaultToolId = keyof typeof defaultTools;
export type DefaultToolMeta = (typeof defaultTools)[DefaultToolId];

export const defaultToolOrder: string[] = [
  defaultTools.select.id,
  defaultTools.hand.id,
  defaultTools.vertex.id,
  defaultTools.apple.id,
  defaultTools.killer.id,
  defaultTools.flower.id,
  defaultTools.picture.id,
  defaultTools.texture.id,
];
