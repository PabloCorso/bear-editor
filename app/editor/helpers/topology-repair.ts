import type { EditorStore } from "../editor-store";
import type { SelectToolState } from "../edit-mode/tools/select-tool";
import {
  getLevelTopology,
  getTopologyRepairPolygons,
  type TopologyAssets,
} from "./level-topology";

export function applyTopologyRepair(
  store: EditorStore,
  issueId: string,
  assets?: TopologyAssets | null,
): boolean {
  // Cancel tool drafts before resolving the issue against the current document.
  store.getState().actions.getActiveTool()?.cancelInteraction();
  const state = store.getState();
  const issue = getLevelTopology(state, assets).issues.find(
    (issue) => issue.id === issueId,
  );
  if (!issue) return false;
  const polygons = getTopologyRepairPolygons(state.polygons, issue);
  if (!polygons) return false;
  store.history.execute({ kind: "topology.repair" }, () => {
    state.actions.setPolygons(polygons);
    state.actions.setToolState<SelectToolState>("select", {
      selectedVertices: [],
      selectedObjects: [],
      selectedPictures: [],
    });
    const inspection = store.getState().topologyInspection;
    if (inspection)
      state.actions.setTopologyInspection({
        ...inspection,
        activeIssueId: null,
        activeCheckId: null,
        previewIssueId: null,
      });
  });
  return true;
}
