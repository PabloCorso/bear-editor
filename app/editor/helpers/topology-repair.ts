import {
  getLevelSnapshot,
  type EditorStore,
  type PartialEditorState,
} from "../editor-store";
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
  store.getState().actions.getActiveTool()?.clear?.();
  const state = store.getState();
  const issue = getLevelTopology(state, assets).issues.find(
    (issue) => issue.id === issueId,
  );
  if (!issue) return false;
  const polygons = getTopologyRepairPolygons(state.polygons, issue);
  if (!polygons) return false;
  const historyStart = getLevelSnapshot(state);
  const history = store.temporal.getState();
  if (!history.isTracking) return false;
  // Same explicit history batching as selection transforms. Bypass the normal
  // drag throttle so each repair is its own undo even after a recent edit.
  history.pause();
  try {
    state.actions.setPolygons(polygons);
  } finally {
    history.resume();
  }
  const internalHistory = store.temporal.getState() as typeof history & {
    _handleSet: (
      past: PartialEditorState,
      replace: undefined,
      current: PartialEditorState,
    ) => void;
  };
  internalHistory._handleSet(
    historyStart,
    undefined,
    getLevelSnapshot(store.getState()),
  );
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
  return true;
}
