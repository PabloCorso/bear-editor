// Optional documentation tool. Run against a local Bear Editor dev server.
import { chromium } from "playwright";
import { mkdir, rm, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const base = process.env.BEAR_SHOWCASE_URL ?? "http://127.0.0.1:5173";
const output = process.env.BEAR_SHOWCASE_OUTPUT ?? "docs/showcase/generated";
const width = 1280;
const height = 800;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function open(path = "/") {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${base}${path}`);
  await page.getByRole("button", { name: /Play mode/ }).waitFor();
  await page.getByRole("button", { name: /Topology check/ }).waitFor();
  const tip = page.getByRole("button", { name: /Dismiss lev folder tip/ });
  if (await tip.isVisible()) await tip.click();
  await page.waitForTimeout(1000);
  if (await page.getByText("Could not start the renderer").isVisible()) {
    throw new Error(
      "WebGL 2 is unavailable; cannot capture real editor visuals.",
    );
  }
  return page;
}

// A small, capture-only overlay makes actions legible without modifying the app.
async function overlay(page, caption, point, markers = []) {
  await page.evaluate(
    ({ caption, point, markers }) => {
      document.querySelector("#showcase-overlay")?.remove();
      const layer = document.createElement("div");
      layer.id = "showcase-overlay";
      layer.style.cssText =
        "position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:600 17px system-ui;";
      const label = document.createElement("div");
      label.textContent = caption;
      label.style.cssText =
        "position:absolute;bottom:65px;left:50%;transform:translateX(-50%);background:#111827;color:white;border:1px solid #64748b;border-radius:8px;padding:10px 20px;box-shadow:0 4px 20px #0005;white-space:nowrap;";
      if (caption) layer.append(label);
      for (const { x, y, text } of markers) {
        const badge = document.createElement("div");
        badge.textContent = text;
        badge.style.cssText = `position:absolute;left:${x}px;top:${y}px;background:#0f172a;color:#fff;border:2px solid #38bdf8;padding:6px 10px;border-radius:7px;`;
        layer.append(badge);
      }
      if (point) {
        const cursor = document.createElement("div");
        cursor.style.cssText = `position:absolute;left:${point[0] - 9}px;top:${point[1] - 9}px;width:18px;height:18px;border:3px solid #38bdf8;border-radius:50%;box-shadow:0 0 0 2px #111827;`;
        layer.append(cursor);
      }
      document.body.append(layer);
    },
    { caption, point, markers },
  );
}

function sequence(name) {
  const frames = join(output, `frames-${name}`);
  let index = 0;
  return {
    async capture(page, caption, point, hold = 1) {
      await mkdir(frames, { recursive: true });
      await overlay(page, caption, point);
      await page.waitForTimeout(100);
      const first = join(frames, `${String(index++).padStart(4, "0")}.png`);
      await page.screenshot({ path: first });
      for (let i = 1; i < hold; i++) {
        await copyFile(
          first,
          join(frames, `${String(index++).padStart(4, "0")}.png`),
        );
      }
    },
    async finish({ video = false } = {}) {
      const input = ["-y", "-framerate", "8", "-i", join(frames, "%04d.png")];
      if (video)
        execFileSync(
          "ffmpeg",
          [
            ...input,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            join(output, `${name}.mp4`),
          ],
          { stdio: "inherit" },
        );
      else
        execFileSync(
          "ffmpeg",
          [
            ...input,
            "-vf",
            "scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse",
            "-loop",
            "0",
            join(output, `${name}.gif`),
          ],
          { stdio: "inherit" },
        );
      await rm(frames, { recursive: true });
    },
  };
}

try {
  // Showcase an existing built-in level, without altering it.
  const example = await open("/QWQUU001");
  await example.screenshot({ path: join(output, "editor-overview.png") });
  await overlay(
    example,
    "Design and test Elasto Mania levels in one workspace",
    null,
    [
      { x: 55, y: 85, text: "1 · Editing tools" },
      { x: 525, y: 140, text: "2 · Level canvas" },
      { x: 1010, y: 85, text: "3 · Playtest" },
    ],
  );
  await example.screenshot({ path: join(output, "editor-annotated.png") });
  const transition = sequence("editor-to-game");
  await transition.capture(example, "Edit the level", null, 12);
  await example.keyboard.press("Enter");
  await example.getByRole("button", { name: /Stop play mode/ }).waitFor();
  await example.keyboard.down("ArrowUp");
  try {
    for (let i = 0; i < 24; i++) {
      await transition.capture(example, "Playtest directly in the editor");
    }
  } finally {
    await example.keyboard.up("ArrowUp");
  }
  await example.keyboard.press("Escape");
  await transition.capture(example, "Return to editing", null, 12);
  await transition.finish({ video: true });
  await example.close();

  // A fresh default level gives reproducible coordinates inside its boundary.
  const page = await open();
  const polygon = sequence("create-polygon");
  const points = [
    [340, 380],
    [480, 350],
    [530, 425],
    [340, 440],
  ];
  await page.keyboard.press("v");
  await polygon.capture(page, "V · Vertex tool", null, 10);
  await page.screenshot({ path: join(output, "step-1.png") });
  for (const [i, point] of points.entries()) {
    await page.mouse.move(...point);
    await polygon.capture(page, `Click to add vertex ${i + 1}`, point, 3);
    await page.mouse.click(...point);
    await polygon.capture(page, `Vertex ${i + 1}`, point, 5);
  }
  await page.screenshot({ path: join(output, "step-2.png") });
  await page.keyboard.press("Enter");
  await polygon.capture(page, "Enter · Finish polygon", null, 12);
  await page.screenshot({ path: join(output, "step-3.png") });
  await polygon.finish();

  const move = sequence("move-vertex");
  await page.keyboard.press("s");
  await page.mouse.click(...points[1]);
  await move.capture(page, "S · Select a vertex", points[1], 10);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    const point = [points[1][0] + i * 3, points[1][1] - i * 2];
    await page.mouse.move(...point);
    await move.capture(page, "Drag the vertex to reshape terrain", point);
  }
  await page.mouse.up();
  await move.capture(page, "Release to finish", null, 12);
  await move.finish();
  await page.close();
} finally {
  await browser.close();
}
