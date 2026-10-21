import { InfoIcon } from "@phosphor-icons/react/dist/ssr";
import {
  useEditor,
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import {
  canToggleVertexToolDirection,
  getToggledVertexToolState,
  VertexTool,
  type VertexToolState,
} from "~/editor/edit-mode/tools/vertex-tool";
import { ELMA_PIXELS_PER_WORLD_UNIT } from "~/editor/constants";
import { CanvasTip, CanvasTipKey, CanvasTipKeyButton } from "./canvas-tip";
import type { SelectToolState } from "~/editor/edit-mode/tools/select-tool";
import { useModifier } from "~/utils/misc";

const segmentClassName =
  "shrink-0 gap-1.5 rounded-none px-2.5 first:rounded-l-full last:rounded-r-full";

export function ToolInfo() {
  const modifier = useModifier();
  const activeToolId = useEditor((state) => state.activeToolId);
  const vertex = useEditorToolState<VertexToolState>("vertex");
  const select = useEditorToolState<SelectToolState>("select");
  const options = useEditor((state) => state.autoGrassOptions);
  const { getActiveTool, setToolState } = useEditorActions();

  if (activeToolId === "select" && select?.transformMode) {
    return (
      <div
        className="flex flex-wrap items-center gap-0.5"
        role="group"
        aria-label="Active tool info"
      >
        <CanvasTip className={segmentClassName}>
          <InfoIcon
            aria-hidden
            className="-ml-1 size-4 shrink-0 text-primary"
          />
          <span className="text-primary">Resize &amp; Rotate</span>
        </CanvasTip>
        <CanvasTip className={segmentClassName}>
          Resize proportionally
          <CanvasTipKey>{modifier}</CanvasTipKey>
        </CanvasTip>
        <CanvasTip className={segmentClassName}>
          Rotate in 45° steps
          <CanvasTipKey>{modifier}</CanvasTipKey>
        </CanvasTip>
      </div>
    );
  }

  if (activeToolId !== "vertex") return null;

  const isAutoGrass =
    vertex?.variant === "autoGrass" || vertex?.previewAutoGrassAll;
  const canChangeDirection = canToggleVertexToolDirection(vertex);
  if (!isAutoGrass && !canChangeDirection) return null;

  const toolName = isAutoGrass
    ? "AutoGrass"
    : vertex?.variant === "grass"
      ? "Grass"
      : vertex?.variant === "both"
        ? "Vertex + Grass"
        : "Vertex";

  return (
    <div
      className="flex flex-wrap items-center gap-0.5"
      role="group"
      aria-label="Active tool info"
    >
      <CanvasTip
        className={`${segmentClassName} gap-1.5 rounded-l-full px-2.5`}
      >
        <InfoIcon aria-hidden className="-ml-1 size-4 shrink-0 text-primary" />
        <span className="text-primary">{toolName}</span>
      </CanvasTip>
      {isAutoGrass ? (
        <>
          {(
            [
              {
                field: "depth",
                label: "Height",
                min: 1,
                decrease: "-",
                increase: "+",
              },
              {
                field: "endInset",
                label: "End inset",
                min: 0,
                decrease: "[",
                increase: "]",
              },
            ] as const
          ).map(({ field, label, min, decrease, increase }) => {
            const value = Math.round(
              options[field] * ELMA_PIXELS_PER_WORLD_UNIT,
            );
            return (
              <CanvasTip key={field} className={segmentClassName}>
                <span className="mr-1 whitespace-nowrap tabular-nums">
                  {label}: {value}
                </span>
                <CanvasTipKeyButton
                  className="size-5 p-0"
                  aria-label={`Decrease AutoGrass ${label.toLowerCase()}`}
                  title={`Decrease ${label.toLowerCase()} (${decrease})`}
                  disabled={value <= min}
                  onClick={() =>
                    getActiveTool<VertexTool>()?.adjustAutoGrassOption(
                      field,
                      -1,
                    )
                  }
                >
                  {decrease}
                </CanvasTipKeyButton>
                <CanvasTipKeyButton
                  className="size-5 p-0"
                  aria-label={`Increase AutoGrass ${label.toLowerCase()}`}
                  title={`Increase ${label.toLowerCase()} (${increase}${field === "depth" ? " or =" : ""})`}
                  disabled={value >= 200}
                  onClick={() =>
                    getActiveTool<VertexTool>()?.adjustAutoGrassOption(field, 1)
                  }
                >
                  {increase}
                </CanvasTipKeyButton>
              </CanvasTip>
            );
          })}
        </>
      ) : canChangeDirection ? (
        <CanvasTip className={segmentClassName}>
          <span className="mr-1">Flip direction</span>
          <CanvasTipKeyButton
            aria-label="Flip direction"
            title="Flip direction (Space)"
            onClick={() => {
              if (!vertex) return;
              const nextToolState = getToggledVertexToolState(vertex);
              if (nextToolState) {
                setToolState<VertexToolState>("vertex", nextToolState);
              }
            }}
          >
            space
          </CanvasTipKeyButton>
        </CanvasTip>
      ) : null}
    </div>
  );
}
