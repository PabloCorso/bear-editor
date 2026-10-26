type Color = {
  picture: { name: string };
  rgb: [number, number, number];
};

// Curated from the decoded Default.lgr inventory in docs/color-palette-analysis.html.
// Other packs use the nearest available decoded color for each target.
const BASE_COLORS = [
  "FCFCFC",
  "D4D4D4",
  "808080",
  "404040",
  "000000",
  "E48060",
  "DC0000",
  "780000",
  "FCA420",
  "FC7000",
  "F4E410",
  "787848",
  "783000",
  "DCF4DC",
  "88FC00",
  "00AC00",
  "005000",
  "68D4F4",
  "609494",
  "94BCD4",
  "0060CC",
  "003078",
  "9410CC",
  "9C2088",
];

export function getColorPalette<T extends Color>(colors: T[]) {
  const candidates = colors.map((color) => ({
    color,
    lab: toOklab(color.rgb),
    family: getColorFamily(color.rgb),
  }));
  const baseNames = new Set<string>();
  for (const hex of BASE_COLORS) {
    const target = toOklab(
      [0, 2, 4].map((offset) =>
        parseInt(hex.slice(offset, offset + 2), 16),
      ) as Color["rgb"],
    );
    let closest: (typeof candidates)[number] | undefined;
    let closestDistance = Infinity;
    for (const candidate of candidates) {
      const distance = candidate.lab.reduce(
        (sum, value, axis) => sum + (value - target[axis]!) ** 2,
        0,
      );
      if (
        distance < closestDistance ||
        (distance === closestDistance &&
          candidate.color.picture.name < closest!.color.picture.name)
      ) {
        closest = candidate;
        closestDistance = distance;
      }
    }
    if (closest) baseNames.add(closest.color.picture.name);
  }
  const ordered = candidates
    .sort(
      (a, b) =>
        a.family - b.family ||
        b.lab[0] - a.lab[0] ||
        a.color.picture.name.localeCompare(b.color.picture.name),
    )
    .map(({ color }) => color);
  return { ordered, baseNames };
}

// Families follow the inventory's explicit design heuristics. Keep greys and
// very dark tints together; order each family by perceptual lightness, not HSL L.
function getColorFamily(rgb: Color["rgb"]) {
  const [r, g, b] = rgb.map((channel) => channel / 255) as Color["rgb"];
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const delta = max - min;
  if (!delta) return 0;
  const [l, a, blue] = toOklab(rgb);
  if (l < 0.23) return 2;
  const lightness = (max + min) / 2;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  if (saturation < 0.15 || Math.hypot(a, blue) < 0.035) return 1;
  const sector =
    max === r
      ? (g - b) / delta
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  const hue = (sector * 60 + 360) % 360;
  if (hue < 15 || hue >= 345) return 3;
  if (hue < 65 && lightness < 0.44) return 6;
  if (hue < 45) return 4;
  if (hue < 70) return 5;
  if (hue < 165) return 7;
  if (hue < 200) return 8;
  if (hue < 255) return 9;
  if (hue < 290) return 10;
  return 11;
}

function toOklab(rgb: Color["rgb"]): [number, number, number] {
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
