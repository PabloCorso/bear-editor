import type { Polygon, Position } from "../elma-types";

export type AlgorithmId =
  | "binary"
  | "imagetracer"
  | "vtracer"
  | "contours"
  | "opencv"
  | "centerline";
export type TraceOptions = {
  threshold: number;
  simplify: number;
  curveTolerance: number;
  minArea: number;
  blur: number;
  colors: number;
  corner: number;
  strokeWidth: number;
  smooth: boolean;
  darkGround: boolean;
  decompose: boolean;
};
export const defaultOptions: TraceOptions = {
  threshold: 128,
  simplify: 0.5,
  curveTolerance: 0.35,
  minArea: 2,
  blur: 0,
  colors: 8,
  corner: 60,
  strokeWidth: 2,
  smooth: true,
  darkGround: true,
  decompose: false,
};
export const algorithms: {
  id: AlgorithmId;
  name: string;
  description: string;
}[] = [
  {
    id: "binary",
    name: "Binary tracing",
    description:
      "ImageTracer with a fixed black/white palette. Smooth silhouettes without color segmentation.",
  },
  {
    id: "imagetracer",
    name: "ImageTracer colors",
    description:
      "Color quantization and quadratic curve fitting. Dark palette regions become polygons.",
  },
  {
    id: "vtracer",
    name: "VTracer",
    description:
      "Color clustering and spline fitting in WebAssembly. Cutout regions preserve holes.",
  },
  {
    id: "contours",
    name: "Marching squares",
    description:
      "D3 contours follow luminance boundaries. Interpolation can preserve antialiased edges.",
  },
  {
    id: "opencv",
    name: "OpenCV contours",
    description:
      "OpenCV findContours with nested contours. A larger runtime, loaded only when used.",
  },
  {
    id: "centerline",
    name: "Centerlines",
    description:
      "Zhang–Suen thinning and LingDong skeleton tracing. Rebuilds lines at a chosen width.",
  },
];
export type TraceRequest = {
  id: AlgorithmId;
  image: ImageData;
  options: TraceOptions;
};
export type TraceResult = {
  polygons: Polygon[];
  milliseconds: number;
  warnings: string[];
};
export type WorkerReply = { result: TraceResult } | { error: string };
export type Ring = Position[];
export type Shape = Ring[];
