import { ArrowsLeftRightIcon } from "@phosphor-icons/react/dist/ssr";
import {
  ToolButton,
  ToolControlButton,
  ToolControlMenu,
  type ToolControlButtonProps,
} from "./tool";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import {
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import {
  canToggleVertexToolDirection,
  getToggledVertexToolState,
  type VertexToolState,
  type VertexToolVariant,
} from "~/editor/edit-mode/tools/vertex-tool";
import { Toolbar, type ToolbarProps } from "~/components/ui/toolbar";
import { colors, uiColors } from "~/editor/constants";
import { cn } from "~/utils/misc";
import { useId } from "react";

export function VertexToolControl(props: ToolControlButtonProps) {
  const vertexToolState = useEditorToolState<VertexToolState>(
    defaultTools.vertex.id,
  );
  const { setToolState } = useEditorActions();

  return (
    <ToolControlMenu
      id={defaultTools.vertex.id}
      button={
        <ToolControlButton {...defaultTools.vertex} {...props}>
          <VertexIcon {...getVertexIconProps(vertexToolState?.variant)} />
        </ToolControlButton>
      }
    >
      <VertexToolbar
        onVariantChange={(variant: VertexToolVariant) => {
          setToolState<VertexToolState>(defaultTools.vertex.id, {
            variant,
          });
        }}
      />
    </ToolControlMenu>
  );
}

type VertexToolbarProps = ToolbarProps & {
  onVariantChange: (variant: VertexToolVariant) => void;
};

function VertexToolbar({ onVariantChange, ...props }: VertexToolbarProps) {
  const vertexTool = useEditorToolState<VertexToolState>(
    defaultTools.vertex.id,
  );
  const { setToolState } = useEditorActions();
  const canToggleDirection = canToggleVertexToolDirection(vertexTool);

  return (
    <Toolbar orientation="vertical" {...props}>
      <ToolControlButton
        {...defaultTools.vertex}
        name={defaultTools.vertex.name}
        shortcut={defaultTools.vertex.shortcut}
        tooltipSide="right"
        size="sm"
        isActive={vertexTool?.variant !== "grass"}
        onClick={() => onVariantChange("normal")}
      >
        <VertexIcon {...getVertexIconProps("normal")} />
      </ToolControlButton>
      <ToolControlButton
        {...defaultTools.vertex}
        name={defaultTools.vertex.variants?.grass?.name}
        shortcut={defaultTools.vertex.variants?.grass?.shortcut}
        tooltipSide="right"
        size="sm"
        isActive={vertexTool?.variant === "grass"}
        onClick={() => onVariantChange("grass")}
      >
        <VertexIcon {...getVertexIconProps("grass")} />
      </ToolControlButton>
      <ToolButton
        name="Toggle direction"
        shortcut="Space"
        tooltipSide="right"
        size="sm"
        disabled={!canToggleDirection}
        onClick={() => {
          if (!vertexTool) return;

          const nextToolState = getToggledVertexToolState(vertexTool);
          if (!nextToolState) return;

          setToolState<VertexToolState>(defaultTools.vertex.id, nextToolState);
        }}
      >
        <ArrowsLeftRightIcon />
      </ToolButton>
    </Toolbar>
  );
}

type PolygonToolbarProps = ToolbarProps & {
  onGrassToggle: () => void;
};

export function VertexContextMenuToolbar({
  onGrassToggle,
  ...props
}: PolygonToolbarProps) {
  return (
    <Toolbar orientation="vertical" {...props}>
      <ToolButton name="Toggle grass" onClick={onGrassToggle}>
        <VertexIcon {...getVertexIconProps("both")} />
      </ToolButton>
    </Toolbar>
  );
}

type VertexIconProps = React.ComponentPropsWithoutRef<"svg"> & {
  sky?: string;
  ground?: string;
  bounds?: boolean;
  boundsColor?: string;
  handles?: boolean;
};

export function VertexIcon({
  className,
  sky = colors.sky,
  ground = colors.ground,
  bounds,
  boundsColor = uiColors.vertexDraftLine,
  handles,
  ...props
}: VertexIconProps) {
  const frameClipId = useId();

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("overflow-visible rounded", className)}
      {...props}
    >
      <defs>
        <clipPath id={frameClipId}>
          <rect x="0" y="0" width="24" height="24" rx="4" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${frameClipId})`}>
        <rect x="0" y="0" width="24" height="24" fill={ground} />
        <path d="M0 0H24L0 24Z" fill={sky} />
      </g>

      {bounds && (
        <path
          d="M2 22L22 2"
          stroke={boundsColor}
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}

      {handles && (
        <>
          <rect
            x="-0.9"
            y="21.1"
            width="3.8"
            height="3.8"
            rx="0.8"
            fill={uiColors.vertexDraftPointFill}
            stroke={uiColors.vertexDraftPointStroke}
          />
          <rect
            x="21.1"
            y="-0.9"
            width="3.8"
            height="3.8"
            rx="0.8"
            fill={uiColors.vertexDraftPointFill}
            stroke={uiColors.vertexDraftPointStroke}
          />
        </>
      )}
    </svg>
  );
}

export function getVertexIconProps(
  variant?: VertexToolVariant,
): VertexIconProps {
  if (variant === "grass") {
    return {
      sky: colors.sky,
      ground: colors.grass,
      bounds: false,
      handles: true,
    };
  }

  if (variant === "both") {
    return {
      sky: colors.ground,
      ground: colors.grass,
      bounds: true,
      handles: false,
    };
  }

  return {
    sky: colors.sky,
    ground: colors.ground,
    bounds: true,
    handles: true,
  };
}
