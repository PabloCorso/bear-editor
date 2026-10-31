import { prepareImage } from "./pixels";
import { finalizeShapes } from "./geometry";
import type { TraceRequest, WorkerReply, Shape } from "./types";

self.onmessage = async (event: MessageEvent<TraceRequest>) => {
  try {
    const start = performance.now();
    const request = {
      ...event.data,
      image: prepareImage(event.data.image, event.data.options.blur),
    };
    let shapes: Shape[];
    switch (request.id) {
      case "binary":
      case "imagetracer":
        shapes = (await import("./adapters/imagetracer")).traceImageTracer(
          request,
        );
        break;
      case "vtracer":
        shapes = await (
          await import("./adapters/vtracer")
        ).traceVTracer(request);
        break;
      case "contours":
        shapes = (await import("./adapters/contours")).traceContours(request);
        break;
      case "opencv":
        shapes = await (await import("./adapters/opencv")).traceOpenCV(request);
        break;
      case "centerline":
        shapes = (await import("./adapters/centerline")).traceCenterline(
          request,
        );
        break;
    }
    const result = finalizeShapes(
      shapes,
      request.image.width,
      request.image.height,
      request.options,
    );
    self.postMessage({
      result: { ...result, milliseconds: performance.now() - start },
    } satisfies WorkerReply);
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    } satisfies WorkerReply);
  }
};
