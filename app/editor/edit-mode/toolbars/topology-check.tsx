import { applyTopologyRepair } from "~/editor/helpers/topology-repair";
import { useRef, useState } from "react";
import {
  BoundingBoxIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  ChecksIcon,
  WarningIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button, IconButton } from "~/components/ui/button";
import { ToolbarButton } from "~/components/ui/toolbar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useLgrAssets } from "~/components/use-lgr-assets";
import { useEditor, useEditorStore } from "~/editor/use-editor-store";
import {
  getLevelTopology,
  getTopologySelection,
  type TopologyCheck as TopologyCheckStatus,
  type TopologyIssue,
} from "~/editor/helpers/level-topology";
import { focusPositionsInView } from "~/editor/helpers/camera-helpers";
import type { SelectToolState } from "~/editor/edit-mode/tools/select-tool";
import { cn } from "~/utils/misc";
import { Switch } from "~/components/ui/switch";

export function TopologyCheck({ isLoading }: { isLoading?: boolean }) {
  const store = useEditorStore();
  const isPlayMode = useEditor((s) => s.isPlayMode);
  return (
    <Tooltip>
      <TooltipTrigger>
        <ToolbarButton
          aria-label="Topology check"
          disabled={isLoading || isPlayMode}
          onClick={() =>
            store.getState().actions.setTopologyInspection({
              activeIssueId: null,
              activeCheckId: null,
              previewIssueId: null,
              showBounds: false,
            })
          }
        >
          <CheckIcon />
        </ToolbarButton>
      </TooltipTrigger>
      <TooltipContent side="bottom">Topology check</TooltipContent>
    </Tooltip>
  );
}

export function TopologyResultPanel() {
  const store = useEditorStore();
  const panelRef = useRef<HTMLElement>(null);
  const { lgr } = useLgrAssets();
  const result = useEditor((state) =>
    state.topologyInspection && !state.isPlayMode
      ? getLevelTopology(state, lgr)
      : null,
  );
  const inspection = useEditor((state) => state.topologyInspection);
  const [showAllChecks, setShowAllChecks] = useState(false);
  if (!result || !inspection) return null;
  const errors = result.issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const warnings = result.issues.length - errors;
  const issueSummary = [
    errors ? `${errors} error${errors === 1 ? "" : "s"}` : null,
    warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const summary = result.truncated
    ? ["Check incomplete", issueSummary].filter(Boolean).join(" · ")
    : issueSummary || "All checks passed";
  const issuesById = new Map(result.issues.map((issue) => [issue.id, issue]));
  const rows = result.checks.filter(
    (check) =>
      check.status !== "passed" ||
      (showAllChecks && check.showWhenPassed !== false),
  );

  function setPreview(issue: TopologyIssue | null) {
    const state = store.getState();
    if (!state.topologyInspection) return;
    state.actions.setTopologyInspection({
      ...state.topologyInspection,
      previewIssueId: issue?.id ?? null,
    });
  }
  function viewCheck(check: TopologyCheckStatus) {
    store.getState().actions.getActiveTool()?.clear?.();
    store.getState().actions.activateTool("select");
    const state = store.getState();
    const currentResult = getLevelTopology(state, lgr);
    const currentCheck = currentResult.checks.find(
      (candidate) => candidate.id === check.id,
    );
    if (!currentCheck || !state.topologyInspection) return;
    const currentIssues = currentCheck.issueIds
      .map((id) => currentResult.issues.find((issue) => issue.id === id))
      .filter((issue): issue is TopologyIssue => Boolean(issue));
    state.actions.setToolState<SelectToolState>("select", {
      selectedVertices: getTopologySelection(state.polygons, currentIssues),
      selectedObjects: currentIssues.flatMap((issue) => issue.objects),
      selectedPictures: currentIssues.flatMap((issue) => issue.pictures),
      hoveredObject: undefined,
      hoveredPictureBounds: undefined,
      contextMenuType: undefined,
    });
    state.actions.setTopologyInspection({
      ...state.topologyInspection,
      activeIssueId: null,
      activeCheckId: check.id,
      previewIssueId: null,
      showBounds:
        state.topologyInspection.showBounds ||
        currentIssues.some((issue) => issue.type === "bounds"),
    });
    const positions = currentIssues.flatMap((issue) =>
      issue.locations.length
        ? issue.locations
        : [...issue.vertices, ...issue.objects, ...issue.pictures],
    );
    if (!positions.length) return;
    const canvas = document.querySelector("canvas");
    const height = canvas?.clientHeight ?? window.innerHeight;
    const width = canvas?.clientWidth ?? window.innerWidth;
    // Focus the unobscured canvas, not the area behind this floating panel.
    const top = Math.min(
      height - 160,
      Math.max(
        0,
        (panelRef.current?.getBoundingClientRect().bottom ?? 0) -
          (canvas?.getBoundingClientRect().top ?? 0) +
          40,
      ),
    );
    const left = Math.min(80, width / 4);
    focusPositionsInView({
      positions,
      viewportWidth: width - left - 16,
      viewportHeight: Math.max(80, height - top - 80),
      minZoom: 0.2,
      maxZoom: 120,
      setCamera: (x, y) => state.actions.setCamera(x + left, y + top),
      setZoom: state.actions.setZoom,
    });
  }
  function repairIssue(issue: TopologyIssue) {
    applyTopologyRepair(store, issue.id, lgr);
  }
  const spatial = result.checks.filter((check) =>
    check.issueIds.some((id) => {
      const issue = issuesById.get(id);
      return Boolean(
        issue &&
        (issue.locations.length ||
          issue.vertices.length ||
          issue.objects.length ||
          issue.pictures.length),
      );
    }),
  );
  function navigate(direction: number) {
    const index = spatial.findIndex(
      (check) => check.id === inspection?.activeCheckId,
    );
    const nextIndex =
      index < 0
        ? direction > 0
          ? 0
          : spatial.length - 1
        : (index + direction + spatial.length) % spatial.length;
    const next = spatial[nextIndex];
    if (next) viewCheck(next);
  }
  return (
    <section
      ref={panelRef}
      className="pointer-events-auto w-[calc(100vw-2rem)] max-w-lg rounded-xl bg-screen p-2 shadow-sm"
      aria-label="Topology results"
    >
      <header className="flex min-h-8 items-center gap-1 pl-1">
        <Tooltip>
          <TooltipTrigger>
            <IconButton
              size="sm"
              className={cn(
                errors
                  ? "text-red-400"
                  : warnings || result.truncated
                    ? "text-amber-300"
                    : "text-green-400",
              )}
              aria-label={
                showAllChecks ? "Hide passed checks" : "Show all checks"
              }
              aria-pressed={showAllChecks}
              onClick={() => setShowAllChecks((show) => !show)}
            >
              {errors ? (
                <XCircleIcon />
              ) : warnings || result.truncated ? (
                <WarningIcon />
              ) : (
                <ChecksIcon />
              )}
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {showAllChecks ? "Hide passed checks" : "Show all checks"}
          </TooltipContent>
        </Tooltip>
        <p
          className="min-w-0 flex-1 text-sm font-semibold"
          role="status"
          aria-live="polite"
        >
          {summary}
        </p>
        <label
          className="flex cursor-pointer items-center gap-1.5 px-1 text-xs text-secondary"
          title="Show all checks"
        >
          <Switch
            checked={showAllChecks}
            onCheckedChange={setShowAllChecks}
            aria-label="Show all checks"
          />
          <span aria-hidden>All</span>
        </label>
        {result.bounds && (
          <Tooltip>
            <TooltipTrigger>
              <IconButton
                size="sm"
                aria-label={
                  inspection.showBounds ? "Hide bounds" : "Show bounds"
                }
                aria-pressed={inspection.showBounds}
                onClick={() =>
                  store.getState().actions.setTopologyInspection({
                    ...inspection,
                    showBounds: !inspection.showBounds,
                  })
                }
              >
                <BoundingBoxIcon
                  weight={inspection.showBounds ? "fill" : "regular"}
                />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {inspection.showBounds ? "Hide bounds" : "Show bounds"}
            </TooltipContent>
          </Tooltip>
        )}
        {spatial.length > 1 && (
          <>
            <IconButton
              size="sm"
              aria-label="Previous check"
              title="Previous check"
              onClick={() => navigate(-1)}
            >
              <CaretLeftIcon />
            </IconButton>
            <IconButton
              size="sm"
              aria-label="Next check"
              title="Next check"
              onClick={() => navigate(1)}
            >
              <CaretRightIcon />
            </IconButton>
          </>
        )}
        <IconButton
          size="sm"
          aria-label="Close topology results"
          onClick={() => store.getState().actions.setTopologyInspection(null)}
        >
          <XIcon />
        </IconButton>
      </header>
      {!!rows.length && (
        <ol className="mt-2 max-h-[min(24rem,50vh)] divide-y divide-separator overflow-y-auto border-t border-separator px-2">
          {rows.map((check) => {
            const issues = check.issueIds
              .map((id) => issuesById.get(id))
              .filter((issue): issue is TopologyIssue => Boolean(issue));
            const firstIssue = issues[0];
            const repair = issues.length === 1 ? firstIssue?.repair : undefined;
            const incomplete = check.status === "incomplete";
            const severity = issues.some((issue) => issue.severity === "error")
              ? "error"
              : "warning";
            const label =
              check.status === "passed"
                ? check.label
                : (check.failureLabel ??
                  (issues.length === 1
                    ? firstIssue?.message
                    : `${issues.length} issues: ${check.label}`) ??
                  check.label);
            const canShow = issues.some(
              (issue) =>
                issue.locations.length ||
                issue.vertices.length ||
                issue.objects.length ||
                issue.pictures.length,
            );
            return (
              <li
                key={check.id}
                className="flex min-h-10 items-center px-1 py-1.5"
              >
                <div className="flex w-full items-center gap-2">
                  {check.status === "passed" ? (
                    <CheckIcon
                      aria-label="Passed"
                      className="ml-1 size-4 shrink-0 text-green-400"
                    />
                  ) : incomplete ? (
                    <XIcon
                      aria-label="Incomplete"
                      className="ml-1 size-4 shrink-0 text-red-400"
                    />
                  ) : severity === "warning" ? (
                    <WarningIcon
                      aria-label="Warning"
                      className="ml-1 size-4 shrink-0 text-amber-300"
                    />
                  ) : (
                    <XIcon
                      aria-label="Error"
                      className="ml-1 size-4 shrink-0 text-red-400"
                    />
                  )}
                  <span className="min-w-0 flex-1 text-sm">{label}</span>
                  {repair && firstIssue && (
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onMouseEnter={() => setPreview(firstIssue)}
                      onMouseLeave={(event) => {
                        if (document.activeElement !== event.currentTarget)
                          setPreview(null);
                      }}
                      onFocus={() => setPreview(firstIssue)}
                      onBlur={(event) => {
                        if (!event.currentTarget.matches(":hover"))
                          setPreview(null);
                      }}
                      onClick={() => repairIssue(firstIssue)}
                      title="Preview on hover or focus; click to apply"
                    >
                      {repair.label}
                    </Button>
                  )}
                  {canShow && (
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => viewCheck(check)}
                    >
                      Show
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
