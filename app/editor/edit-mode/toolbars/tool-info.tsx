import {
  useEditor,
  useEditorActions,
  useEditorToolState,
  useEditorRegisteredTools,
} from "~/editor/use-editor-store";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import {
  canToggleVertexToolDirection,
  getToggledVertexToolState,
  VertexTool,
  type VertexToolState,
} from "~/editor/edit-mode/tools/vertex-tool";
import { ELMA_PIXELS_PER_WORLD_UNIT } from "~/editor/constants";
import {
  CanvasTipGroup,
  CanvasTipSections,
  CanvasTipSection,
  CanvasTipSegment,
  CanvasTipNumberControl,
  CanvasTipKey,
  CanvasTipKeyButton,
} from "./canvas-tip";
import type { SelectToolState } from "~/editor/edit-mode/tools/select-tool";
import { useModifier } from "~/utils/misc";

import {
  DEFAULT_PIPE_WIDTH_PX,
  MIN_PIPE_WIDTH_PX,
  MAX_PIPE_WIDTH_PX,
  DEFAULT_PIPE_APPLE_DISTANCE,
  PIPE_APPLE_DISTANCE_STEP,
  MAX_PIPE_APPLE_DISTANCE,
  DEFAULT_PIPE_APPLE_COUNT,
  MAX_PIPE_APPLE_COUNT,
} from "~/editor/helpers/pipe";

export function ToolInfo() {
  const modifier = useModifier();
  const activeToolId = useEditor((state) => state.activeToolId);
  const hasPictures = useEditor((state) => state.pictures.length > 0);
  const registeredTools = useEditorRegisteredTools();
  const vertex = useEditorToolState<VertexToolState>("vertex");
  const select = useEditorToolState<SelectToolState>("select");
  const options = useEditor((state) => state.autoGrassOptions);
  const { getActiveTool, setToolState } = useEditorActions();
  const activeTool = (
    registeredTools.length ? registeredTools : Object.values(defaultTools)
  ).find((tool) => tool.id === activeToolId);
  const toolName =
    activeTool?.name ??
    (activeToolId === "ai-chat" ? "AI Assistant" : activeToolId);

  if (activeToolId === "select" && select?.transformMode) {
    return (
      <CanvasTipGroup
        title={`${toolName} · Resize & Rotate`}
        aria-label="Active tool info"
      >
        <CanvasTipSegment>
          Resize proportionally
          <CanvasTipKey>{modifier}</CanvasTipKey>
        </CanvasTipSegment>
        <CanvasTipSegment>
          Rotate in 45° steps
          <CanvasTipKey>{modifier}</CanvasTipKey>
        </CanvasTipSegment>
      </CanvasTipGroup>
    );
  }

  if (activeToolId === "select") {
    return (
      <CanvasTipGroup title={toolName} aria-label="Active tool info">
        {hasPictures && (
          <CanvasTipSegment>
            Pick behind images
            <CanvasTipKey>Shift / Alt + Click</CanvasTipKey>
          </CanvasTipSegment>
        )}
        {!!select?.selectedVertices.length && (
          <CanvasTipSegment>
            Slide along edge
            <CanvasTipKey>Shift + Drag</CanvasTipKey>
          </CanvasTipSegment>
        )}
      </CanvasTipGroup>
    );
  }

  if (["picture", "texture", "color"].includes(activeToolId)) {
    return (
      <CanvasTipGroup title={toolName} aria-label="Active tool info">
        <CanvasTipSegment>
          Properties
          <CanvasTipKey>Right click</CanvasTipKey>
        </CanvasTipSegment>
      </CanvasTipGroup>
    );
  }

  if (activeToolId !== "vertex") {
    return <CanvasTipGroup title={toolName} aria-label="Active tool info" />;
  }

  const isAutoGrass =
    vertex?.variant === "autoGrass" || vertex?.previewAutoGrassAll;
  const isPipe = vertex?.variant === "pipe" && !isAutoGrass;
  const pipeWidth = vertex?.pipeWidthPx ?? DEFAULT_PIPE_WIDTH_PX;
  const pipeAppleMode = vertex?.pipeAppleMode ?? "none";
  const canChangeDirection = canToggleVertexToolDirection(vertex);

  if (isPipe) {
    return (
      <CanvasTipSections aria-label="Active tool info">
        <CanvasTipGroup title="Pipe" aria-label="Pipe width">
          <CanvasTipNumberControl
            label="Width"
            accessibleLabel="pipe width"
            value={pipeWidth}
            min={MIN_PIPE_WIDTH_PX}
            max={MAX_PIPE_WIDTH_PX}
            onAdjust={(delta) =>
              getActiveTool<VertexTool>()?.adjustPipeWidth(delta)
            }
          />
        </CanvasTipGroup>
        <CanvasTipSection aria-label="Pipe apples">
          <CanvasTipSegment>
            <span className="mr-1">Mode</span>
            <CanvasTipKeyButton
              aria-label="Change pipe apple mode"
              title="Mode (Space)"
              onClick={() => getActiveTool<VertexTool>()?.cyclePipeAppleMode()}
            >
              space
            </CanvasTipKeyButton>
          </CanvasTipSegment>
          {pipeAppleMode === "none" ? (
            <CanvasTipSegment>No apples</CanvasTipSegment>
          ) : (
            <CanvasTipNumberControl
              label={pipeAppleMode === "distance" ? "Apple distance" : "Apples"}
              accessibleLabel={
                pipeAppleMode === "distance" ? "apple distance" : "apple count"
              }
              value={
                pipeAppleMode === "distance"
                  ? (vertex?.pipeAppleDistance ?? DEFAULT_PIPE_APPLE_DISTANCE)
                  : (vertex?.pipeAppleCount ?? DEFAULT_PIPE_APPLE_COUNT)
              }
              min={pipeAppleMode === "distance" ? PIPE_APPLE_DISTANCE_STEP : 0}
              max={
                pipeAppleMode === "distance"
                  ? MAX_PIPE_APPLE_DISTANCE
                  : MAX_PIPE_APPLE_COUNT
              }
              decreaseKey="["
              increaseKey="]"
              increaseShortcut="]"
              onAdjust={(delta) =>
                getActiveTool<VertexTool>()?.adjustPipeApples(delta)
              }
            />
          )}
        </CanvasTipSection>
        <CanvasTipSection aria-label="Pipe start and flower">
          <CanvasTipSegment>
            <span className="mr-1">
              Start: {vertex?.pipeStart ? "On" : "Off"}
            </span>
            <CanvasTipKeyButton
              aria-label="Toggle start chamber and player"
              aria-pressed={!!vertex?.pipeStart}
              title="Toggle start chamber and player (S)"
              onClick={() => getActiveTool<VertexTool>()?.togglePipeStart()}
            >
              S
            </CanvasTipKeyButton>
          </CanvasTipSegment>
          <CanvasTipSegment>
            <span className="mr-1">
              Flower: {vertex?.pipeFlower ? "On" : "Off"}
            </span>
            <CanvasTipKeyButton
              aria-label="Toggle end flower"
              aria-pressed={!!vertex?.pipeFlower}
              title="Toggle end flower (F)"
              onClick={() => getActiveTool<VertexTool>()?.togglePipeFlower()}
            >
              F
            </CanvasTipKeyButton>
          </CanvasTipSegment>
        </CanvasTipSection>
      </CanvasTipSections>
    );
  }

  const vertexToolName = isAutoGrass
    ? "AutoGrass"
    : vertex?.variant === "grass"
      ? "Grass"
      : vertex?.variant === "both"
        ? "Vertex + Grass"
        : "Vertex";

  return (
    <CanvasTipGroup title={vertexToolName} aria-label="Active tool info">
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
              <CanvasTipNumberControl
                key={field}
                label={label}
                accessibleLabel={`AutoGrass ${label.toLowerCase()}`}
                value={value}
                min={min}
                max={200}
                decreaseKey={decrease}
                increaseKey={increase}
                increaseShortcut={field === "depth" ? "+ or =" : increase}
                onAdjust={(delta) =>
                  getActiveTool<VertexTool>()?.adjustAutoGrassOption(
                    field,
                    delta,
                  )
                }
              />
            );
          })}
        </>
      ) : canChangeDirection ? (
        <CanvasTipSegment>
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
        </CanvasTipSegment>
      ) : null}
    </CanvasTipGroup>
  );
}
