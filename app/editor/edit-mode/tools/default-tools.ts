type DefaultToolVariant = { name: string; shortcut: string };

export type ToolMenuBehavior = "toolGroup" | "options";

export type ToolMeta = {
  id: string;
  name: string;
  shortcut: string;
  menuBehavior?: ToolMenuBehavior;
  variants?: Record<string, DefaultToolVariant>;
};

export const defaultTools = {
  select: { id: "select", name: "Select tool", shortcut: "S" },
  hand: { id: "hand", name: "Hand tool", shortcut: "H" },
  vertex: {
    id: "vertex",
    name: "Vertex",
    menuBehavior: "toolGroup",
    shortcut: "V",
    variants: {
      grass: { name: "Grass", shortcut: "G" },
      brush: { name: "Brush", shortcut: "B" },
      draw: { name: "Draw", shortcut: "D" },
      smooth: { name: "Smooth", shortcut: "Shift + S" },
      pipe: { name: "Pipe", shortcut: "Shift + P" },
      cutConnect: { name: "Cut & Connect", shortcut: "X" },
      frame: { name: "Frame", shortcut: "Shift + F" },
      autoGrass: { name: "AutoGrass", shortcut: "Shift + G" },
    },
  },
  union: { id: "union", name: "Union", shortcut: "" },
  subtract: { id: "subtract", name: "Subtract", shortcut: "" },
  intersect: { id: "intersect", name: "Intersect", shortcut: "" },
  apple: { menuBehavior: "options", id: "apple", name: "Apple", shortcut: "A" },
  killer: { id: "killer", name: "Killer", shortcut: "K" },
  flower: { id: "flower", name: "Flower", shortcut: "F" },
  picture: {
    menuBehavior: "options",
    id: "picture",
    name: "Picture",
    shortcut: "P",
  },
  color: {
    menuBehavior: "options",
    id: "color",
    name: "Color",
    shortcut: "C",
  },
  texture: {
    menuBehavior: "options",
    id: "texture",
    name: "Texture",
    shortcut: "T",
  },
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
  defaultTools.color.id,
];
