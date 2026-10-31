declare module "imagetracerjs" {
  const tracer: {
    imagedataToSVG(image: ImageData, options: Record<string, unknown>): string;
  };
  export default tracer;
}
declare module "skeleton-tracing-js/trace_skeleton.vanilla.js" {
  const Skeleton: {
    fromBoolArray(
      image: number[],
      width: number,
      height: number,
    ): { polylines: number[][][] };
  };
  export default Skeleton;
}
