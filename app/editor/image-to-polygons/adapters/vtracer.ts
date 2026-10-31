import init, { to_svg } from "vtracer-wasm";
import wasmUrl from "vtracer-wasm/vtracer.wasm?url";
import { shapesFromSvg } from "../svg";
import type { TraceRequest } from "../types";

export async function traceVTracer({ image, options }: TraceRequest) {
  await init({ module_or_path: wasmUrl });
  const svg = to_svg(
    new Uint8Array(image.data.buffer),
    image.width,
    image.height,
    {
      binary: false,
      mode: options.smooth ? "spline" : "polygon",
      hierarchical: "cutout",
      cornerThreshold: (options.corner * Math.PI) / 180,
      lengthThreshold: 4,
      maxIterations: 10,
      spliceThreshold: Math.PI / 4,
      filterSpeckle: Math.round(options.minArea),
      // This binding passes the number of discarded color bits to visioncortex.
      colorPrecision: Math.max(0, 8 - Math.ceil(Math.log2(options.colors))),
      layerDifference: 16,
      pathPrecision: 4,
    },
  );
  return shapesFromSvg(svg, options.threshold, options.curveTolerance);
}
