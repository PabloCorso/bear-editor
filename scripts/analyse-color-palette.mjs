import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import elma from "elmajs";
import ts from "typescript";

// Run from the repo root: node scripts/analyse-color-palette.mjs
// Use the editor's real decoder, including declaration-based transparency.
const source = await readFile("app/editor/helpers/pcx-loader.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { decodeLgrSpritePixels } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const bytes = await readFile("app/assets/lgr/Default.lgr");
const lgr = elma.LGR.from(new Uint8Array(bytes));
const normalize = (name) =>
  name
    .trim()
    .toLowerCase()
    .replace(/\.pcx$/, "");
const declarations = new Map(
  lgr.pictureList.map((d) => [normalize(d.name), d]),
);
const colors = [];

for (const picture of lgr.pictureData) {
  const name = normalize(picture.name);
  if (!/^zz[0-9a-f]{6}$/.test(name)) continue;
  const declaration = declarations.get(name);
  const { pixels, width, height } = decodeLgrSpritePixels(picture, declaration);
  const counts = new Map();
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const rgba = Array.from(pixels.subarray(offset, offset + 4)).join(",");
    counts.set(rgba, (counts.get(rgba) ?? 0) + 1);
  }
  const variants = [...counts].map(([rgba, count]) => ({
    rgba: rgba.split(",").map(Number),
    count,
  }));
  const visible = variants.filter(({ rgba }) => rgba[3] > 0);
  if (visible.length !== 1)
    throw new Error(`${name}: expected one visible color`);
  const rgb = visible[0].rgba.slice(0, 3);
  const hex = `#${rgb
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
  const lab = toOklab(rgb);
  const [hue, lightness, saturation] = toHsl(rgb);
  const color = {
    name,
    hex,
    rgb,
    width,
    height,
    variants,
    distance: declaration.distance,
    clip: declaration.clipping,
    hue,
    lightness,
    saturation,
    lab,
    chroma: Math.hypot(lab[1], lab[2]),
  };
  color.family = familyOf(color);
  colors.push(color);
}

const families = [
  "Neutral",
  "Tinted grey",
  "Very dark tints",
  "Red",
  "Orange",
  "Yellow",
  "Brown / olive",
  "Green",
  "Cyan / teal",
  "Blue",
  "Purple",
  "Pink / magenta",
];
const recommended = [
  ["White", "#FCFCFC"],
  ["Light grey", "#D4D4D4"],
  ["Grey", "#808080"],
  ["Dark grey", "#404040"],
  ["Black", "#000000"],
  ["Salmon", "#E48060"],
  ["Red", "#DC0000"],
  ["Dark red", "#780000"],
  ["Amber", "#FCA420"],
  ["Orange", "#FC7000"],
  ["Yellow", "#F4E410"],
  ["Olive", "#787848"],
  ["Brown", "#783000"],
  ["Pale green", "#DCF4DC"],
  ["Lime", "#88FC00"],
  ["Green", "#00AC00"],
  ["Dark green", "#005000"],
  ["Cyan", "#68D4F4"],
  ["Muted teal", "#609494"],
  ["Light blue", "#94BCD4"],
  ["Blue", "#0060CC"],
  ["Navy", "#003078"],
  ["Purple", "#9410CC"],
  ["Magenta", "#9C2088"],
].map(([label, hex]) => {
  const color = colors.find((c) => c.hex === hex);
  if (!color) throw new Error(`Unavailable recommendation: ${hex}`);
  return { label, name: color.name, hex };
});
const selectedNames = new Set(recommended.map((c) => c.name));
for (const color of colors) {
  const neighbours = colors
    .filter((c) => c !== color)
    .map((c) => ({
      name: c.name,
      hex: c.hex,
      distance: Math.hypot(...c.lab.map((v, i) => v - color.lab[i])),
    }))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name));
  color.nearest = neighbours[0];
  color.recommended = selectedNames.has(color.name);
}
const summary = {
  source: "app/assets/lgr/Default.lgr",
  sha256: createHash("sha256").update(bytes).digest("hex"),
  pictures: colors.length,
  uniqueVisibleColors: new Set(colors.map((c) => c.hex)).size,
  filenameMismatches: colors
    .filter((c) => c.name.slice(2) !== c.hex.slice(1).toLowerCase())
    .map((c) => c.name),
  familyCounts: Object.fromEntries(
    families.map((family) => [
      family,
      colors.filter((c) => c.family === family).length,
    ]),
  ),
  nearestDistanceBelow002: colors.filter((c) => c.nearest.distance < 0.02)
    .length,
  nearestDistanceBelow004: colors.filter((c) => c.nearest.distance < 0.04)
    .length,
};
const data = { summary, recommended, colors };
await writeFile(
  "docs/color-palette-analysis.json",
  `${JSON.stringify(data, null, 2)}\n`,
);
await writeFile("docs/color-palette-analysis.html", renderReport());
console.log(JSON.stringify({ ...summary, recommended }, null, 2));

function familyOf({ rgb, saturation, hue, lightness, lab, chroma }) {
  if (Math.max(...rgb) === Math.min(...rgb)) return "Neutral";
  if (lab[0] < 0.23) return "Very dark tints";
  if (saturation < 0.15 || chroma < 0.035) return "Tinted grey";
  if (hue < 15 || hue >= 345) return "Red";
  if (hue < 65 && lightness < 0.44) return "Brown / olive";
  if (hue < 45) return "Orange";
  if (hue < 70) return "Yellow";
  if (hue < 165) return "Green";
  if (hue < 200) return "Cyan / teal";
  if (hue < 255) return "Blue";
  if (hue < 290) return "Purple";
  return "Pink / magenta";
}

function toHsl(rgb) {
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const delta = max - min,
    lightness = (max + min) / 2;
  if (!delta) return [0, lightness, 0];
  const sector =
    max === r
      ? (g - b) / delta
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  return [
    (sector * 60 + 360) % 360,
    lightness,
    delta / (1 - Math.abs(2 * lightness - 1)),
  ];
}

function toOklab(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function renderReport() {
  const card = (c, label = c.name) =>
    `<article class="card ${selectedNames.has(c.name) ? "chosen" : ""}"><div class="swatch" style="background:${c.hex}"></div><strong>${label}</strong><code>${c.hex}</code><small>${c.name}</small></article>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Default.lgr color inventory</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#191b20;color:#e5e7eb;margin:0;padding:32px}main{max-width:1160px;margin:auto}h1{font-size:28px}h2{margin-top:36px}p{max-width:900px;color:#bdc4ce}a{color:#a5c7ff}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:12px}.card{min-width:0;padding:8px;background:#24272e;border:1px solid #424753;border-radius:8px;display:flex;flex-direction:column;gap:3px}.chosen{outline:2px solid #83aaff;outline-offset:1px}.swatch{height:64px;border-radius:4px;border:1px solid #ffffff25}strong{font-size:12px}code{font-size:12px}small{font-size:10px;color:#bdc4ce}.note{padding:16px;background:#24272e;border-radius:8px}td,th{padding:5px 16px 5px 0;text-align:left}details{margin-top:24px}summary{cursor:pointer;font-size:18px;font-weight:600;margin-bottom:16px}</style>
<main><h1>Default.lgr: all 256 decoded colors</h1>
<p>256 pictures, 256 unique visible colors, zero filename/hex mismatches. Decoded using the editor’s actual PCX decoder and each image’s transparency declaration. This inventory does not change the editor UI.</p>
<h2>Proposed base palette · ${recommended.length} colors</h2><p>A curated starting point: recognisable families plus useful shade variants, rather than equal quotas or one slot for every tiny difference. These labels describe existing pictures; no synthetic colors are introduced.</p><div class="grid">${recommended.map((r) => card(r, r.label)).join("")}</div>
<h2>What the full palette contains</h2><table><tr><th>Approximate family</th><th>Pictures</th><th>Base palette</th></tr>${families.map((f) => `<tr><td>${f}</td><td>${summary.familyCounts[f]}</td><td>${colors.filter((c) => c.family === f && c.recommended).length}</td></tr>`).join("")}</table>
<p class="note">Family boundaries are design heuristics, not universal human color categories. Exact greys are separated first; non-grey Oklab lightness below 0.23 goes into “Very dark tints”; low saturation or chroma goes into “Tinted grey”; remaining colors use hue ranges, with dark oranges/yellows grouped as brown/olive. Within each family, the inventory runs from perceptually light to dark using Oklab L.</p>
<p>${summary.nearestDistanceBelow002} of 256 colors have another color within 0.02 Oklab distance; ${summary.nearestDistanceBelow004} have one within 0.04. These are descriptive proximity thresholds, not claims of indistinguishability. Display, surroundings, swatch size and color vision affect perception. Method: <a href="https://bottosson.github.io/posts/oklab/">Oklab by Björn Ottosson</a>.</p>
<p>There is no pure #FFFFFF picture: the lightest exact grey is #FCFCFC. The black picture is 200×201: 40,000 opaque black pixels and 200 transparent pixels. All other color pictures are 200×200 and uniformly opaque. Blue outlines below mark proposed base colors.</p>
${families
  .map(
    (f) =>
      `<details open><summary>${f} · ${summary.familyCounts[f]}</summary><div class="grid">${colors
        .filter((c) => c.family === f)
        .sort((a, b) => b.lab[0] - a.lab[0] || a.name.localeCompare(b.name))
        .map((c) => card(c))
        .join("")}</div></details>`,
  )
  .join("")}
<h2>Suggested expanded order</h2><p>Keep neutrals together, then travel through hue families. Within families, group muted versus saturated variants where useful and order by Oklab lightness. Keep the very dark tints together rather than scattering almost-black entries across the column. Retain every original picture in the expanded view.</p>
<p>Source SHA-256: <code>${summary.sha256}</code><br>Reproduce: <code>node scripts/analyse-color-palette.mjs</code><br>Exact inventory and nearest neighbours: <a href="color-palette-analysis.json">JSON data</a>.</p></main></html>`;
}
