import { PencilSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import {
  ToolControlButton,
  ToolControlMenu,
  type ToolControlButtonProps,
} from "./tool";
import { ToolButton } from "~/components/tool-button";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import {
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import {
  type VertexToolState,
  type VertexToolVariant,
} from "~/editor/edit-mode/tools/vertex-tool";
import { Toolbar, type ToolbarProps } from "~/components/ui/toolbar";
import { colors, uiColors } from "~/editor/constants";
import { cn } from "~/utils/misc";
import { useId } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
export const AUTO_GRASS_ALL_SHORTCUT = "Shift + G";

export function VertexToolControl(props: ToolControlButtonProps) {
  const vertexToolState = useEditorToolState<VertexToolState>(
    defaultTools.vertex.id,
  );
  const { activateTool } = useEditorActions();

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
          activateTool(defaultTools.vertex.id, variant);
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

  return (
    <Toolbar orientation="vertical" className="w-max items-stretch" {...props}>
      <ToolControlButton
        {...defaultTools.vertex}
        name={defaultTools.vertex.name}
        shortcut={defaultTools.vertex.shortcut}
        tooltipSide="right"
        size="sm"
        showLabel
        isActive={!vertexTool?.variant || vertexTool.variant === "normal"}
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
        showLabel
        isActive={vertexTool?.variant === "grass"}
        onClick={() => onVariantChange("grass")}
      >
        <VertexIcon {...getVertexIconProps("grass")} />
      </ToolControlButton>
      <ToolControlButton
        {...defaultTools.vertex}
        name={defaultTools.vertex.variants?.autoGrass?.name}
        shortcut={undefined}
        tooltipSide="right"
        size="sm"
        showLabel
        isActive={vertexTool?.variant === "autoGrass"}
        onClick={() => onVariantChange("autoGrass")}
      >
        <VertexIcon {...getVertexIconProps("autoGrass")} />
      </ToolControlButton>
      <div
        role="separator"
        aria-orientation="horizontal"
        className="my-1 h-px self-stretch bg-separator"
      />
      <ToolControlButton
        {...defaultTools.vertex}
        name="Pipe"
        shortcut={defaultTools.vertex.variants.pipe.shortcut}
        tooltipSide="right"
        size="sm"
        showLabel
        isActive={vertexTool?.variant === "pipe"}
        onClick={() => onVariantChange("pipe")}
      >
        <VertexIcon {...getVertexIconProps("pipe")} />
      </ToolControlButton>
      <ToolControlButton
        {...defaultTools.vertex}
        name="Draw"
        shortcut={undefined}
        tooltipSide="right"
        size="sm"
        showLabel
        isActive={vertexTool?.variant === "draw"}
        onClick={() => onVariantChange("draw")}
      >
        <VertexIcon {...getVertexIconProps("draw")} />
      </ToolControlButton>
      <ToolControlButton
        {...defaultTools.vertex}
        name="Brush"
        shortcut={undefined}
        tooltipSide="right"
        size="sm"
        showLabel
        isActive={vertexTool?.variant === "brush"}
        onClick={() => onVariantChange("brush")}
      >
        <VertexIcon {...getVertexIconProps("brush")} />
      </ToolControlButton>
      <ToolControlButton
        {...defaultTools.vertex}
        name="Frame"
        shortcut={defaultTools.vertex.variants.frame.shortcut}
        tooltipSide="right"
        size="sm"
        showLabel
        isActive={vertexTool?.variant === "frame"}
        onClick={() => onVariantChange("frame")}
      >
        <VertexIcon {...getVertexIconProps("frame")} />
      </ToolControlButton>
      <ToolControlButton
        {...defaultTools.vertex}
        name={defaultTools.vertex.variants.cutConnect.name}
        shortcut={defaultTools.vertex.variants.cutConnect.shortcut}
        tooltipSide="right"
        size="sm"
        showLabel
        isActive={vertexTool?.variant === "cutConnect"}
        onClick={() => onVariantChange("cutConnect")}
      >
        <VertexIcon {...getVertexIconProps("cutConnect")} />
      </ToolControlButton>
    </Toolbar>
  );
}

type PolygonToolbarProps = ToolbarProps & {
  onGrassToggle: () => void;
  onAutoGrass?: () => void;
};

export function VertexContextMenuToolbar({
  onAutoGrass,
  onGrassToggle,
  ...props
}: PolygonToolbarProps) {
  return (
    <Toolbar orientation="vertical" {...props}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger>
          <ToolButton name="Polygon actions">
            <VertexIcon {...getVertexIconProps("normal")} />
          </ToolButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start">
          <DropdownMenuItem
            iconBefore={<VertexIcon {...getVertexIconProps("both")} />}
            onClick={onGrassToggle}
          >
            Toggle grass
          </DropdownMenuItem>
          {onAutoGrass ? (
            <DropdownMenuItem
              iconBefore={<VertexIcon {...getVertexIconProps("autoGrass")} />}
              onClick={onAutoGrass}
            >
              AutoGrass
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </Toolbar>
  );
}

type VertexIconProps = React.ComponentPropsWithoutRef<"svg"> & {
  sky?: string;
  ground?: string;
  bounds?: boolean;
  boundsColor?: string;
  handles?: boolean;
  badge?: string;
  corridor?: boolean | "narrow";
  frame?: boolean;
  freehand?: boolean;
};

export function VertexIcon({
  className,
  sky = colors.sky,
  ground = colors.ground,
  bounds,
  boundsColor = uiColors.vertexDraftLine,
  handles,
  badge,
  corridor,
  frame,
  freehand,
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

      {frame ? (
        <g clipPath={`url(#${frameClipId})`}>
          <rect width="24" height="24" fill={sky} />
          <path
            d="M3 3H21V21H3ZM7 7V17H17V7Z"
            fill={ground}
            fillRule="evenodd"
            stroke={boundsColor}
            strokeWidth="1"
          />
        </g>
      ) : freehand && corridor ? (
        <g clipPath={`url(#${frameClipId})`}>
          <rect width="24" height="24" fill={ground} />
          <path
            d="M-3 18C4 18 3 5 10 5S16 17 27 4L27 13C16 26 11 12 10 12S9 25-3 25Z"
            fill={sky}
            stroke={boundsColor}
            strokeWidth="1.5"
          />
          <PencilSimpleIcon x="12" y="0" width="13" height="13" color="white" />
        </g>
      ) : freehand ? (
        <g clipPath={`url(#${frameClipId})`}>
          <rect width="24" height="24" fill={sky} />
          <path
            d="M0 20L4 16L6 9L10 7L13 12L17 10L24 17V24H0Z"
            fill={ground}
            stroke={boundsColor}
            strokeWidth="1.5"
          />
          <PencilSimpleIcon x="12" y="0" width="13" height="13" color="white" />
        </g>
      ) : corridor ? (
        <g clipPath={`url(#${frameClipId})`}>
          <rect width="24" height="24" fill={ground} />
          <path
            d={
              corridor === "narrow"
                ? "M-3 24L24-3L27 0L0 27Z"
                : "M-3 20L20-3L27 4L4 27Z"
            }
            fill={sky}
            stroke={boundsColor}
            strokeWidth="1.5"
          />
        </g>
      ) : (
        <g clipPath={`url(#${frameClipId})`}>
          <rect x="0" y="0" width="24" height="24" fill={ground} />
          <path d="M0 0H24L0 24Z" fill={sky} />
        </g>
      )}

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

      {badge ? (
        <g aria-hidden="true" pointerEvents="none">
          <text
            x="22.5"
            y="22.5"
            fill="#ffffff"
            stroke="#111827"
            strokeWidth="2"
            paintOrder="stroke"
            fontSize="9"
            fontWeight="800"
            textAnchor="end"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {badge}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

export function getVertexIconProps(
  variant?: VertexToolVariant,
): VertexIconProps {
  if (variant === "cutConnect") {
    return {
      corridor: "narrow",
      badge: "C",
      sky: colors.ground,
      ground: colors.sky,
    };
  }
  if (variant === "frame") return { frame: true };
  if (variant === "brush") return { corridor: true, freehand: true };

  if (variant === "draw") return { freehand: true };

  if (variant === "pipe") {
    return { corridor: true };
  }

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

  if (variant === "autoGrass") {
    return {
      sky: colors.sky,
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
