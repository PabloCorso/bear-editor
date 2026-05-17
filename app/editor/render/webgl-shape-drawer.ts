import type { WebGLColor, WebGLRenderContext } from "~/editor/render/webgl-render-context";
import { colorToRgba, hexToRgb } from "~/editor/render/webgl-render-context";
import type { WorldPoint, WorldRenderScene } from "~/editor/render/world-scene";
import {
  appendCircleOutlineVertices,
  appendCircleVertices,
  appendLineVertices,
  appendRectOutlineVertices,
  appendRectVertices,
  getCachedTriangulation,
} from "~/editor/render/webgl-geometry";

export class WebGLShapeDrawer {
  constructor(private context: WebGLRenderContext) {}

  drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    scene: WorldRenderScene,
    opacity = 1,
  ) {
    const vertices: number[] = [];
    appendRectVertices(vertices, x, y, width, height);
    this.drawSolidVertices(vertices, colorToRgba(color, opacity), scene);
  }

  drawRectOutline(
    x: number,
    y: number,
    width: number,
    height: number,
    lineWidth: number,
    color: string,
    scene: WorldRenderScene,
    opacity = 1,
  ) {
    const vertices: number[] = [];
    appendRectOutlineVertices(vertices, x, y, width, height, lineWidth);
    this.drawSolidVertices(vertices, colorToRgba(color, opacity), scene);
  }

  drawQuad(
    corners: [number, number, number, number, number, number, number, number],
    color: string,
    scene: WorldRenderScene,
  ) {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = corners;
    this.drawSolidVertices(
      [
        x0,
        y0,
        0,
        0,
        x1,
        y1,
        0,
        0,
        x2,
        y2,
        0,
        0,
        x0,
        y0,
        0,
        0,
        x2,
        y2,
        0,
        0,
        x3,
        y3,
        0,
        0,
      ],
      [...hexToRgb(color), 1],
      scene,
    );
  }

  drawPolygon(vertices: WorldPoint[], color: string, scene: WorldRenderScene) {
    const triangles: number[] = [];
    for (const [firstIndex, secondIndex, thirdIndex] of getCachedTriangulation(
      vertices,
    )) {
      const first = vertices[firstIndex]!;
      const second = vertices[secondIndex]!;
      const third = vertices[thirdIndex]!;
      triangles.push(
        first.x,
        first.y,
        0,
        0,
        second.x,
        second.y,
        0,
        0,
        third.x,
        third.y,
        0,
        0,
      );
    }

    this.drawSolidVertices(triangles, [...hexToRgb(color), 1], scene);
  }

  drawLine(
    from: WorldPoint,
    to: WorldPoint,
    width: number,
    color: string,
    scene: WorldRenderScene,
    opacity = 1,
  ) {
    const vertices: number[] = [];
    appendLineVertices(vertices, from, to, width);
    this.drawSolidVertices(vertices, colorToRgba(color, opacity), scene);
  }

  drawCircle(
    center: WorldPoint,
    radius: number,
    color: string,
    scene: WorldRenderScene,
    opacity = 1,
  ) {
    const vertices: number[] = [];
    appendCircleVertices(vertices, center, radius);
    this.drawSolidVertices(vertices, colorToRgba(color, opacity), scene);
  }

  drawCircleOutline(
    center: WorldPoint,
    radius: number,
    lineWidth: number,
    color: string,
    scene: WorldRenderScene,
    opacity = 1,
  ) {
    const vertices: number[] = [];
    appendCircleOutlineVertices(vertices, center, radius, lineWidth);
    this.drawSolidVertices(vertices, colorToRgba(color, opacity), scene);
  }

  private drawSolidVertices(
    vertices: number[],
    color: WebGLColor,
    scene: WorldRenderScene,
  ) {
    this.context.drawVertices({ vertices, color, scene });
  }
}
