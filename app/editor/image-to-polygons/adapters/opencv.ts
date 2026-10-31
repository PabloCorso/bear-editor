import cvRuntime from "@techstark/opencv-js";
import type cvTypes from "@techstark/opencv-js";
import { bitmap } from "../pixels";
import type { Ring, TraceRequest } from "../types";

export async function traceOpenCV({ image, options }: TraceRequest) {
  // The runtime is self-contained (embedded WASM) and is never loaded by other adapters.
  const cv = cvRuntime as unknown as typeof cvTypes & {
    then: (ready: () => void) => void;
  };
  // OpenCV 4.x exposes a self-resolving Emscripten thenable. Awaiting it
  // directly recursively assimilates itself; resolve a separate void promise.
  await new Promise<void>((resolve) => cv.then(() => resolve()));
  const mask = bitmap(image, options);
  const width = image.width + 2,
    height = image.height + 2;
  const source = cv.Mat.zeros(height, width, cv.CV_8UC1);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    mask.forEach((v, i) => {
      source.data[
        (Math.floor(i / image.width) + 1) * width + (i % image.width) + 1
      ] = v * 255;
    });
    cv.findContours(
      source,
      contours,
      hierarchy,
      cv.RETR_TREE,
      cv.CHAIN_APPROX_SIMPLE,
    );
    const rings: Ring[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      try {
        rings.push(
          Array.from({ length: contour.rows }, (_, j) => ({
            x: contour.data32S[j * 2] - 1,
            y: contour.data32S[j * 2 + 1] - 1,
          })),
        );
      } finally {
        contour.delete();
      }
    }
    // RETR_TREE preserves all nesting depths. Each even depth is an outer
    // boundary; its direct children are holes, grandchildren become new shapes.
    const shapes: Ring[][] = [];
    for (let i = 0; i < rings.length; i++) {
      let depth = 0,
        parent = hierarchy.data32S[i * 4 + 3];
      while (parent !== -1) {
        depth++;
        parent = hierarchy.data32S[parent * 4 + 3];
      }
      if (depth % 2 || rings[i].length < 3) continue;
      const holes = rings.filter(
        (r, j) => r.length >= 3 && hierarchy.data32S[j * 4 + 3] === i,
      );
      shapes.push([rings[i], ...holes]);
    }
    return shapes;
  } finally {
    source.delete();
    contours.delete();
    hierarchy.delete();
  }
}
