import type { EditorState } from "~/editor/editor-state";
import {
  getLevelTopology,
  type TopologyAssets,
} from "~/editor/helpers/level-topology";
import { EOL_LEVEL_LIMITS } from "~/editor/helpers/level-limits";
import { uiColors } from "~/editor/constants";
import type { WorldRenderOverlayItem } from "~/editor/render/world-scene";

export function getTopologyOverlays(
  state: EditorState,
  assets: TopologyAssets,
): WorldRenderOverlayItem[] {
  const inspection = state.topologyInspection;
  if (!inspection || state.isPlayMode) return [];
  const result = getLevelTopology(state, assets);
  const overlays: WorldRenderOverlayItem[] = [];
  const activeCheck = result.checks.find(
    (check) => check.id === inspection.activeCheckId,
  );
  const activeIssueIds = new Set([
    ...(inspection.activeIssueId ? [inspection.activeIssueId] : []),
    ...(activeCheck?.issueIds ?? []),
  ]);
  for (const issue of result.issues) {
    const active = activeIssueIds.has(issue.id);
    const color = issue.severity === "error" ? "#f87171" : "#fbbf24";
    // All locations stay visible while checking. Highlight the active check.
    for (const position of issue.locations.slice(0, 200)) {
      const size = (active ? 18 : 12) / state.zoom;
      overlays.push({
        type: "rect",
        position: { x: position.x - size / 2, y: position.y - size / 2 },
        width: size,
        height: size,
        strokeColor: color,
        lineWidth: (active ? 2 : 1.5) / state.zoom,
        opacity: active ? 1 : 0.65,
        layer: "top",
      });
    }
    if (active) {
      const affected = new Set(issue.vertices);
      for (const polygon of state.polygons) {
        for (let i = 0; i < polygon.vertices.length; i++) {
          const from = polygon.vertices[i],
            to = polygon.vertices[(i + 1) % polygon.vertices.length];
          if (affected.has(from) && affected.has(to))
            overlays.push({
              type: "line",
              from,
              to,
              width: 2 / state.zoom,
              color,
              opacity: 0.8,
              layer: "top",
            });
        }
      }
    }
  }
  if (inspection.showBounds && result.bounds) {
    const { minX, minY, maxX, maxY } = result.bounds;
    overlays.push({
      type: "rect",
      position: { x: minX, y: minY },
      width: maxX - minX,
      height: maxY - minY,
      strokeColor: "#fbbf24",
      lineWidth: 1.5 / state.zoom,
      layer: "top",
    });
    // This frame is a span reference, not a fixed world-coordinate boundary.
    const dimension = EOL_LEVEL_LIMITS.dimension;
    overlays.push({
      type: "rect",
      position: {
        x: (minX + maxX - dimension) / 2,
        y: (minY + maxY - dimension) / 2,
      },
      width: dimension,
      height: dimension,
      strokeColor: uiColors.boundsIdle,
      lineWidth: 1 / state.zoom,
      opacity: 0.6,
      layer: "top",
    });
  }
  const preview = result.issues.find(
    (issue) => issue.id === inspection.previewIssueId,
  )?.repair;
  if (preview && state.polygons.includes(preview.polygon)) {
    overlays.push({
      type: "polyline",
      points: preview.replacement.vertices,
      closed: !preview.replacement.grass,
      color: uiColors.vertexDraftLine,
      width: 2 / state.zoom,
      opacity: 0.8,
      layer: "top",
    });
    for (const center of preview.replacement.vertices)
      overlays.push({
        type: "circle",
        center,
        radius: 3 / state.zoom,
        fillColor: uiColors.vertexDraftPointFill,
        strokeColor: uiColors.vertexDraftPointStroke,
        lineWidth: 1 / state.zoom,
        layer: "top",
      });
  }
  return overlays;
}
