import {
  useEditor,
  useEditorActions,
  useEditorToolState,
  useEditorRegisteredTools,
} from "~/editor/use-editor-store";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import {
  getPipeToolSettings,
  getDrawEdgeLength,
  DEFAULT_DRAW_EDGE_LENGTH_PX,
  MIN_DRAW_EDGE_LENGTH_PX,
  MAX_DRAW_EDGE_LENGTH_PX,
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
  DEFAULT_CUT_CONNECT_WIDTH_PX,
  MIN_CUT_CONNECT_WIDTH_PX,
  MAX_CUT_CONNECT_WIDTH_PX,
} from "~/editor/helpers/cut-and-connect";

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

import {
  FRAME_MODE_LABELS,
  DEFAULT_FRAME_WIDTH_PX,
  MIN_FRAME_WIDTH_PX,
  MAX_FRAME_WIDTH_PX,
} from "~/editor/helpers/frame";

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

  if (activeToolId === "select" && select?.transformMode && select.skewMode) {
    return (
      <CanvasTipGroup
        title={`${toolName} · Skew`}
        aria-label="Active tool info"
      />
    );
  }

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

  if (vertex?.variant === "frame" && !vertex.previewAutoGrassAll) {
    return (
      <CanvasTipSections aria-label="Active tool info">
        <CanvasTipGroup title="Frame" aria-label="Frame width">
          <CanvasTipNumberControl
            label="Width"
            accessibleLabel="frame width"
            value={vertex.frameWidthPx ?? DEFAULT_FRAME_WIDTH_PX}
            min={MIN_FRAME_WIDTH_PX}
            max={MAX_FRAME_WIDTH_PX}
            onAdjust={(delta) =>
              getActiveTool<VertexTool>()?.adjustFrameWidth(delta)
            }
          />
        </CanvasTipGroup>
        <CanvasTipSection aria-label="Frame mode">
          <CanvasTipSegment>
            <span className="mr-1">
              Mode: {FRAME_MODE_LABELS[vertex.frameMode ?? "inside"]}
            </span>
            <CanvasTipKeyButton
              aria-label="Change frame mode"
              title="Cycle Inside / Outside / Centered (Space)"
              onClick={() => getActiveTool<VertexTool>()?.cycleFrameMode()}
            >
              space
            </CanvasTipKeyButton>
          </CanvasTipSegment>
        </CanvasTipSection>
      </CanvasTipSections>
    );
  }

  const isAutoGrass =
    vertex?.variant === "autoGrass" || vertex?.previewAutoGrassAll;
  const isDraw = vertex?.variant === "draw" && !isAutoGrass;
  const isBrush = vertex?.variant === "brush" && !isAutoGrass;
  const isPipe = (vertex?.variant === "pipe" || isBrush) && !isAutoGrass;
  const pipeName = isBrush ? "Brush" : "Pipe";
  const pipeWidth =
    getPipeToolSettings(vertex).pipeWidthPx ?? DEFAULT_PIPE_WIDTH_PX;
  const pipeAppleMode = getPipeToolSettings(vertex).pipeAppleMode ?? "none";
  const canChangeDirection = canToggleVertexToolDirection(vertex);
  if (vertex?.variant === "cutConnect" && !isAutoGrass) {
    return (
      <CanvasTipSections aria-label="Active tool info">
        <CanvasTipGroup
          title="Cut & Connect"
          aria-label="Cut and connect width"
        >
          <CanvasTipNumberControl
            label="Width"
            accessibleLabel="cut and connect width"
            value={vertex.cutConnectWidthPx ?? DEFAULT_CUT_CONNECT_WIDTH_PX}
            min={MIN_CUT_CONNECT_WIDTH_PX}
            max={MAX_CUT_CONNECT_WIDTH_PX}
            onAdjust={(delta) =>
              getActiveTool<VertexTool>()?.adjustCutConnectWidth(delta)
            }
          />
        </CanvasTipGroup>
        {vertex.cutConnectError && (
          <CanvasTipSection role="status">
            {vertex.cutConnectError}
          </CanvasTipSection>
        )}
      </CanvasTipSections>
    );
  }

  if (isDraw) {
    return (
      <CanvasTipGroup title="Draw" aria-label="Active tool info">
        <CanvasTipNumberControl
          label="Edge length"
          accessibleLabel="draw edge length"
          value={getDrawEdgeLength(vertex) ?? DEFAULT_DRAW_EDGE_LENGTH_PX}
          min={MIN_DRAW_EDGE_LENGTH_PX}
          max={MAX_DRAW_EDGE_LENGTH_PX}
          onAdjust={(delta) =>
            getActiveTool<VertexTool>()?.adjustDrawEdgeLength(delta)
          }
        />
      </CanvasTipGroup>
    );
  }

  if (isPipe) {
    return (
      <CanvasTipSections aria-label="Active tool info">
        <CanvasTipGroup title={pipeName} aria-label={`${pipeName} width`}>
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
        {isBrush && (
          <CanvasTipSection aria-label="Brush drawing">
            <CanvasTipNumberControl
              label="Edge length"
              accessibleLabel="brush edge length"
              value={getDrawEdgeLength(vertex) ?? DEFAULT_DRAW_EDGE_LENGTH_PX}
              min={MIN_DRAW_EDGE_LENGTH_PX}
              max={MAX_DRAW_EDGE_LENGTH_PX}
              decreaseKey=","
              increaseKey="."
              increaseShortcut="."
              onAdjust={(delta) =>
                getActiveTool<VertexTool>()?.adjustDrawEdgeLength(delta)
              }
            />
          </CanvasTipSection>
        )}
        <CanvasTipSection aria-label={`${pipeName} apples`}>
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
                  ? (getPipeToolSettings(vertex).pipeAppleDistance ??
                    DEFAULT_PIPE_APPLE_DISTANCE)
                  : (getPipeToolSettings(vertex).pipeAppleCount ??
                    DEFAULT_PIPE_APPLE_COUNT)
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
