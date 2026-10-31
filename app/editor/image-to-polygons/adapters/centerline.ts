import Skeleton from "skeleton-tracing-js/trace_skeleton.vanilla.js";
import { bitmap } from "../pixels";
import { strokePolylines } from "../geometry";
import type { TraceRequest } from "../types";

export function traceCenterline({ image, options }: TraceRequest) {
  // Padding preserves strokes touching the image edge during thinning.
  const width = image.width + 2,
    height = image.height + 2;
  const mask = bitmap(image, options);
  const padded = new Array<number>(width * height).fill(0);
  mask.forEach((value, i) => {
    padded[(Math.floor(i / image.width) + 1) * width + (i % image.width) + 1] =
      value;
  });
  const lines = Skeleton.fromBoolArray(padded, width, height).polylines.map(
    (line) => line.map(([x, y]) => [x - 1, y - 1]),
  );
  return strokePolylines(lines, options.strokeWidth);
}
