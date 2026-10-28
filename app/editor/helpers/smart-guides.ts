import type { Position } from "~/editor/elma-types";
import type { WorldRect } from "~/editor/render/world-geometry";

export type GuideMatch = {
  axis: "x" | "y";
  source: Position;
  target: Position;
};

// Bounds anchors are useful for complete shapes and images. Game objects and
// individual vertices instead use their actual level coordinates.
export function getGuideBoundsAnchors(bounds: WorldRect): Position[] {
  const x = (bounds.minX + bounds.maxX) / 2;
  const y = (bounds.minY + bounds.maxY) / 2;
  return [
    { x, y },
    { x: bounds.minX, y },
    { x: bounds.maxX, y },
    { x, y: bounds.minY },
    { x, y: bounds.maxY },
  ];
}

type Latch = { sourceIndex: number; target: Position };

/** A drag-local snapshot: no scanning/sorting the entire level on pointermove. */
export class SmartGuideDrag {
  private targets: Record<"x" | "y", Position[]>;
  private latches: Partial<Record<"x" | "y", Latch>> = {};

  constructor(
    private sources: Position[],
    targets: Position[],
  ) {
    const finite = targets.filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
    );
    this.targets = {
      x: [...finite].sort((a, b) => a.x - b.x || a.y - b.y),
      y: [...finite].sort((a, b) => a.y - b.y || a.x - b.x),
    };
  }

  reset() {
    this.latches = {};
  }

  resolve(delta: Position, zoom: number, snap: boolean) {
    const scale = Math.max(zoom, 0.000001);
    const result = { ...delta };
    const matches: GuideMatch[] = [];
    for (const axis of ["x", "y"] as const) {
      const perpendicular = axis === "x" ? "y" : "x";
      let best: Latch | undefined;
      let bestDistance = Infinity;
      let bestSeparation = Infinity;
      const previous = snap ? this.latches[axis] : undefined;
      if (previous) {
        const source = this.sources[previous.sourceIndex];
        // A wider release radius avoids chatter at the acquisition threshold.
        if (
          Math.abs(source[axis] + delta[axis] - previous.target[axis]) <=
            10 / scale &&
          Math.abs(
            source[perpendicular] +
              delta[perpendicular] -
              previous.target[perpendicular],
          ) <=
            600 / scale
        )
          best = previous;
      }
      if (!best) {
        const targets = this.targets[axis];
        this.sources.forEach((source, sourceIndex) => {
          const value = source[axis] + delta[axis];
          const threshold = 6 / scale;
          let low = 0;
          let high = targets.length;
          while (low < high) {
            const mid = (low + high) >>> 1;
            if (targets[mid][axis] < value - threshold) low = mid + 1;
            else high = mid;
          }
          for (
            let i = low;
            i < targets.length && targets[i][axis] <= value + threshold;
            i++
          ) {
            const target = targets[i];
            const distance = Math.abs(target[axis] - value);
            const separation = Math.abs(
              target[perpendicular] -
                source[perpendicular] -
                delta[perpendicular],
            );
            if (separation > 600 / scale) continue;
            if (
              distance < bestDistance ||
              (distance === bestDistance && separation < bestSeparation)
            ) {
              best = { sourceIndex, target };
              bestDistance = distance;
              bestSeparation = separation;
            }
          }
        });
      }
      this.latches[axis] = snap ? best : undefined;
      if (!best) continue;
      const source = this.sources[best.sourceIndex];
      if (snap) result[axis] = best.target[axis] - source[axis];
      matches.push({ axis, source, target: best.target });
    }
    return {
      delta: result,
      matches: matches.map((match) => ({
        ...match,
        source: { x: match.source.x + result.x, y: match.source.y + result.y },
      })),
    };
  }
}
