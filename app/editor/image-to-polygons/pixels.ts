import type { TraceOptions } from "./types";

export function luminance(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Composite transparency over white consistently for every adapter.
export function prepareImage(image: ImageData, blur: number): ImageData {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("This browser cannot process images in a worker.");
  context.putImageData(image, 0, 0);
  const output = new OffscreenCanvas(image.width, image.height);
  const target = output.getContext("2d");
  if (!target) throw new Error("Could not create an image buffer.");
  target.fillStyle = "white";
  target.fillRect(0, 0, image.width, image.height);
  if (blur) target.filter = `blur(${blur}px)`;
  target.drawImage(canvas, 0, 0);
  return target.getImageData(0, 0, image.width, image.height);
}

export function bitmap(image: ImageData, options: TraceOptions) {
  return Array.from({ length: image.width * image.height }, (_, i) =>
    Number(
      luminance(
        image.data[i * 4],
        image.data[i * 4 + 1],
        image.data[i * 4 + 2],
      ) < options.threshold,
    ),
  );
}
