/**
 * Spatial hash grid for polygon segments - ported from segments.h/cpp
 */
import { Vec2, unitVector } from "../core/vec2";
import { SEGMENTS_BORDER, LEVEL_MAX_SIZE } from "../core/constants";
import type { LevelData } from "../level";

export interface Segment {
  r: Vec2;
  v: Vec2;
  unitVector: Vec2;
  length: number;
}

export class Segments {
  private segList: Segment[] = [];
  private collisionGrid: (Segment[] | null)[] | null = null;
  private gridWidth = 1;
  private gridHeight = 1;
  private cellSize = 1.0;
  private gridOrigin = new Vec2(0, 0);
  private currentCell: Segment[] | null = null;
  private currentCellIndex = 0;
  private iterIndex = 0;

  constructor(level: LevelData) {
    // Load all ground polygons (non-grass)
    for (const poly of level.polygons) {
      if (poly.isGrass) continue;
      for (let j = 0; j < poly.vertices.length; j++) {
        const r1 = poly.vertices[j]!;
        const r2 = poly.vertices[(j + 1) % poly.vertices.length]!;
        const v = r2.sub(r1);
        // Invert y coordinates (level -> physics space)
        this.segList.push({
          r: new Vec2(r1.x, -r1.y),
          v: new Vec2(v.x, -v.y),
          unitVector: new Vec2(0, 0),
          length: 0,
        });
      }
    }
  }

  setupCollisionGrid(maxRadius: number): void {
    if (this.segList.length <= 0) {
      throw new Error("No segments to create collision grid");
    }

    this.cellSize = 1.0;

    // Get min/max values
    let minx = this.segList[0]!.r.x;
    let maxx = this.segList[0]!.r.x;
    let miny = this.segList[0]!.r.y;
    let maxy = this.segList[0]!.r.y;

    for (const seg of this.segList) {
      if (seg.r.x < minx) minx = seg.r.x;
      if (seg.r.x > maxx) maxx = seg.r.x;
      if (seg.r.y < miny) miny = seg.r.y;
      if (seg.r.y > maxy) maxy = seg.r.y;

      const endX = seg.r.x + seg.v.x;
      const endY = seg.r.y + seg.v.y;
      if (endX < minx) minx = endX;
      if (endX > maxx) maxx = endX;
      if (endY < miny) miny = endY;
      if (endY > maxy) maxy = endY;
    }

    // Add border margin
    minx -= SEGMENTS_BORDER;
    miny -= SEGMENTS_BORDER;
    maxx += SEGMENTS_BORDER;
    maxy += SEGMENTS_BORDER;

    this.gridOrigin = new Vec2(minx, miny);
    const width = maxx - minx;
    const height = maxy - miny;

    this.gridWidth = Math.floor(width / this.cellSize + 1.0);
    this.gridHeight = Math.floor(height / this.cellSize + 1.0);

    const maxSize = LEVEL_MAX_SIZE + 2 * SEGMENTS_BORDER;
    if (this.gridWidth > maxSize || this.gridHeight > maxSize) {
      throw new Error("Level too large for collision grid");
    }

    // Allocate grid
    const gridSize = this.gridWidth * this.gridHeight;
    this.collisionGrid = new Array(gridSize).fill(null);

    // Populate
    for (const seg of this.segList) {
      this.addSegmentToCollisionGrid(seg, maxRadius);
    }
  }

  private addNodeToCell(cellX: number, cellY: number, seg: Segment): void {
    if (cellX >= this.gridWidth || cellY >= this.gridHeight) return;
    if (cellX < 0 || cellY < 0) return;
    const idx = this.gridWidth * cellY + cellX;
    if (!this.collisionGrid![idx]) {
      this.collisionGrid![idx] = [];
    }
    this.collisionGrid![idx]!.push(seg);
  }

  private addSegmentToCollisionGrid(seg: Segment, maxRadius: number): void {
    // Calculate length and unit vector
    seg.length = seg.v.length();
    if (seg.length < 0.00000001) return;
    seg.unitVector = unitVector(seg.v);

    // Convert to grid coordinates
    let vx = seg.v.x / this.cellSize;
    let vy = seg.v.y / this.cellSize;
    let rx = (seg.r.x - this.gridOrigin.x) / this.cellSize;
    let ry = (seg.r.y - this.gridOrigin.y) / this.cellSize;
    const mr = (maxRadius * 1.5) / this.cellSize;

    // If segment is taller than wide, swap axes
    let invertAxes = false;
    if (Math.abs(vy) > Math.abs(vx)) {
      invertAxes = true;
      [vx, vy] = [vy, vx];
      [rx, ry] = [ry, rx];
    }

    // Ensure left-to-right
    if (vx < 0) {
      rx = rx + vx;
      ry = ry + vy;
      vx = -vx;
      vy = -vy;
    }

    const slope = vy / vx;
    const y0 = ry - slope * rx;
    const xstart = rx - mr;

    let cellX = 0;
    if (xstart > 0) cellX = Math.floor(xstart);
    const xend = Math.floor(rx + vx + mr);

    while (cellX <= xend) {
      let y1 = slope * cellX + y0;
      let y2 = slope * (cellX + 1) + y0;
      if (y1 > y2) [y1, y2] = [y2, y1];
      y1 -= mr;
      y2 += mr;

      let cellY = 0;
      if (y1 > 0) cellY = Math.floor(y1);
      const yend = Math.floor(y2);

      while (cellY <= yend) {
        if (invertAxes) {
          this.addNodeToCell(cellY, cellX, seg);
        } else {
          this.addNodeToCell(cellX, cellY, seg);
        }
        cellY++;
      }
      cellX++;
    }
  }

  iterateCollisionGridCellSegments(r: Vec2): void {
    if (!this.collisionGrid) {
      throw new Error("Collision grid not initialized");
    }
    const rx = (r.x - this.gridOrigin.x) / this.cellSize;
    const ry = (r.y - this.gridOrigin.y) / this.cellSize;

    let cellX = 0;
    if (rx > 0) cellX = Math.floor(rx);
    let cellY = 0;
    if (ry > 0) cellY = Math.floor(ry);

    if (cellX >= this.gridWidth) cellX = this.gridWidth - 1;
    if (cellY >= this.gridHeight) cellY = this.gridHeight - 1;

    this.currentCell = this.collisionGrid[this.gridWidth * cellY + cellX]!;
    this.currentCellIndex = 0;
  }

  nextCollisionGridSegment(): Segment | null {
    if (!this.currentCell || this.currentCellIndex >= this.currentCell.length) {
      return null;
    }
    return this.currentCell[this.currentCellIndex++]!;
  }

  iterateAllSegments(): void {
    this.iterIndex = 0;
  }

  nextSegment(): Segment | null {
    if (this.iterIndex >= this.segList.length) return null;
    return this.segList[this.iterIndex++]!;
  }
}
