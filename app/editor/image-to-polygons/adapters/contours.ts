import { contours } from "d3-contour";
import { luminance } from "../pixels";
import type { Shape, TraceRequest } from "../types";

export function traceContours({ image, options }: TraceRequest): Shape[] {
  const values = Array.from(
    { length: image.width * image.height },
    (_, i) =>
      255 -
      luminance(
        image.data[i * 4],
        image.data[i * 4 + 1],
        image.data[i * 4 + 2],
      ),
  );
  return contours()
    .size([image.width, image.height])
    .smooth(options.smooth)
    .contour(values, 255 - options.threshold)
    .coordinates.map((shape) =>
      shape.map((ring) => ring.map(([x, y]) => ({ x, y }))),
    );
}
