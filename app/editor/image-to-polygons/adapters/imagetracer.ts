import tracer from "imagetracerjs";
import { bitmap } from "../pixels";
import { shapesFromSvg } from "../svg";
import type { TraceRequest } from "../types";

export function traceImageTracer({ image, options, id }: TraceRequest) {
  const binary = id === "binary";
  if (binary) {
    const mask = bitmap(image, options);
    image = {
      ...image,
      width: image.width,
      height: image.height,
      data: new Uint8ClampedArray(image.data),
    };
    mask.forEach((v, i) => {
      image.data[i * 4] =
        image.data[i * 4 + 1] =
        image.data[i * 4 + 2] =
          v ? 0 : 255;
    });
  }
  const svg = tracer.imagedataToSVG(image, {
    ltres: options.smooth ? 1 : 0.1,
    qtres: options.smooth ? 1 : 0.1,
    pathomit: options.minArea,
    colorsampling: 0,
    numberofcolors: options.colors,
    colorquantcycles: 3,
    ...(binary
      ? {
          pal: [
            { r: 0, g: 0, b: 0, a: 255 },
            { r: 255, g: 255, b: 255, a: 255 },
          ],
        }
      : {}),
    layering: 0,
    strokewidth: 0,
    roundcoords: 4,
    scale: 1,
  });
  return shapesFromSvg(svg, options.threshold, options.curveTolerance);
}
