import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import {
  useEditor,
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import {
  ShapeTool,
  defaultShapeState,
  type ShapeToolState,
} from "../tools/shape-tool";
import {
  builtinShapes,
  createShapePolygons,
  isCompositeLibraryItem,
  libraryContentBounds,
  shapeBounds,
  DEFAULT_ARROW_ASPECT_RATIO,
  MAX_SHAPE_POINTS,
  type CustomShape,
} from "~/editor/helpers/shapes";
import type { Polygon } from "~/editor/elma-types";
import { defaultTools } from "../tools/default-tools";
import {
  ToolControlButton,
  ToolControlMenu,
  type ToolControlButtonProps,
} from "./tool";
import { Toolbar } from "~/components/ui/toolbar";
import { Popover, PopoverTrigger } from "~/components/ui/popover";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  CanvasTipGroup,
  CanvasTipSegment,
  CanvasTipKey,
  CanvasTipNumberControl,
  CanvasTipKeyButton,
} from "./canvas-tip";
import { cn } from "~/utils/misc";
import {
  SettingsPopoverContent,
  SettingsPopoverFields,
} from "./settings-popover";

// Toolbar icons always use the default geometry, independently of the draft.
const builtinShapeItems = builtinShapes.map((shape) => ({
  ...shape,
  polygons: createShapePolygons({
    shape: shape.id,
    start: { x: 0, y: 0 },
    end: {
      x: shape.id === "arrow" ? DEFAULT_ARROW_ASPECT_RATIO : 1,
      y: 1,
    },
  }),
}));

export function ShapePreview({
  polygons,
  custom,
  className,
}: {
  polygons: Polygon[];
  custom?: CustomShape;
  className?: string;
}) {
  const rawBounds = custom
    ? libraryContentBounds(custom)
    : shapeBounds(polygons);
  if (!Number.isFinite(rawBounds.minX)) return null;
  const markerSize = Math.max(rawBounds.width, rawBounds.height, 1) * 0.08;
  const width = Math.max(rawBounds.width, markerSize * 2);
  const height = Math.max(rawBounds.height, markerSize * 2);
  const bounds = {
    minX: rawBounds.minX - (width - rawBounds.width) / 2,
    minY: rawBounds.minY - (height - rawBounds.height) / 2,
    width,
    height,
  };
  const pad = Math.max(width, height) * 0.08;
  return (
    <svg
      aria-hidden
      className={cn("h-16 w-20", className)}
      viewBox={`${bounds.minX - pad} ${bounds.minY - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`}
    >
      {polygons.map((p, index) => (
        <polygon
          key={index}
          points={p.vertices.map((v) => `${v.x},${v.y}`).join(" ")}
          fill="currentColor"
          fillOpacity={p.grass ? 0.08 : 0.2}
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {custom?.pictures.map((picture, index) => (
        <rect
          key={`picture-${index}`}
          x={picture.position.x - markerSize / 2}
          y={picture.position.y - markerSize / 2}
          width={markerSize}
          height={markerSize}
          fill="currentColor"
          fillOpacity="0.35"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {[
        ...(custom?.apples.map((apple) => apple.position) ?? []),
        ...(custom?.killers ?? []),
        ...(custom?.flowers ?? []),
      ].map((position, index) => (
        <circle
          key={`object-${index}`}
          cx={position.x}
          cy={position.y}
          r={markerSize / 2}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export function ShapeToolControl(props: ToolControlButtonProps) {
  const toolState =
    useEditorToolState<ShapeToolState>("shape") ?? defaultShapeState;
  const shapes = useEditor((state) => state.customShapes);
  const { getTool, setCustomShapes, setToolMenuOpen } = useEditorActions();
  const items: {
    id: string;
    name: string;
    polygons: Polygon[];
    custom?: CustomShape;
  }[] = [
    ...builtinShapeItems,
    ...shapes.map((shape) => ({ ...shape, custom: shape })),
  ];
  const tool = () => getTool<ShapeTool>("shape");
  return (
    <ToolControlMenu
      id="shape"
      button={
        <ToolControlButton {...defaultTools.shape} {...props}>
          <ShapePreview
            polygons={builtinShapeItems[0].polygons}
            className="h-6 w-6"
          />
        </ToolControlButton>
      }
    >
      <Toolbar
        orientation="vertical"
        className="w-[104px] gap-0.5 p-1"
        aria-label="Library"
      >
        <ul className="flex w-full flex-col gap-0.5 [&>li+li]:border-t [&>li+li]:border-separator [&>li+li]:pt-0.5">
          <li className="px-1.5 py-1 text-[10px] font-bold text-secondary">
            Shapes
          </li>
          {items.map((item) => (
            <li
              key={item.id}
              ref={
                item.id === toolState.shapeId
                  ? scrollSelectedShapeIntoView
                  : undefined
              }
            >
              {item.custom && item.id === shapes[0]?.id && (
                <div className="px-1.5 py-1 text-[10px] font-bold text-secondary">
                  Saved
                </div>
              )}
              {item.custom && (
                <Popover modal={false}>
                  <PopoverTrigger>
                    <button
                      type="button"
                      className="flex h-5 w-full cursor-pointer items-center justify-center truncate rounded px-1.5 text-center text-[10px] font-medium text-secondary outline-hidden hover:bg-primary-hover/50 hover:text-primary focus-visible:focus-ring aria-expanded:bg-primary-hover/50 aria-expanded:text-primary"
                      aria-label={`Edit ${item.name}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span className="w-full truncate text-center">
                        {item.name}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <SettingsPopoverContent
                    title="Library item properties"
                    closeLabel="Close library item properties"
                  >
                    <SettingsPopoverFields>
                      <label
                        htmlFor={`shape-name-${item.id}`}
                        className="text-xs font-bold text-secondary"
                      >
                        Name
                      </label>
                      <Input
                        key={item.name}
                        id={`shape-name-${item.id}`}
                        size="sm"
                        defaultValue={item.name}
                        maxLength={80}
                        className="w-32"
                        onFocus={(event) => event.currentTarget.select()}
                        onBlur={(event) => {
                          const name =
                            event.currentTarget.value.trim() || item.name;
                          setCustomShapes(
                            shapes.map((shape) =>
                              shape.id === item.id ? { ...shape, name } : shape,
                            ),
                          );
                          event.currentTarget.value = name;
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            event.currentTarget.value = item.name;
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    </SettingsPopoverFields>
                    <div className="mt-2 border-t border-separator pt-2">
                      <Button
                        type="button"
                        size="sm"
                        className="w-full text-red-300 hover:bg-red-950/50 hover:text-red-200"
                        onClick={() => {
                          if (item.id === toolState.shapeId)
                            tool()?.selectShape("ellipse");
                          setCustomShapes(
                            shapes.filter((shape) => shape.id !== item.id),
                          );
                        }}
                      >
                        Delete item
                      </Button>
                    </div>
                  </SettingsPopoverContent>
                </Popover>
              )}
              <button
                type="button"
                aria-pressed={
                  !toolState.capturing && item.id === toolState.shapeId
                }
                onClick={() => {
                  tool()?.selectShape(item.id);
                  setToolMenuOpen(false);
                }}
                className={cn(
                  "flex h-[96px] w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded p-1 text-secondary hover:bg-primary-hover/50 hover:text-primary focus-visible:focus-ring",
                  !toolState.capturing &&
                    item.id === toolState.shapeId &&
                    "bg-primary-hover/50 text-primary",
                )}
              >
                {!item.custom && (
                  <span className="max-w-full truncate text-[10px] font-medium">
                    {item.name}
                  </span>
                )}
                <ShapePreview
                  polygons={item.polygons}
                  custom={item.custom}
                  className="h-20 w-20"
                />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              aria-label="Save polygons from canvas"
              aria-pressed={toolState.capturing}
              className={cn(
                "flex h-[96px] w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded border border-dashed border-separator text-secondary hover:bg-primary-hover/50 focus-visible:focus-ring",
                toolState.capturing && "bg-primary-hover/50",
              )}
              onClick={() => {
                tool()?.startCapture();
                setToolMenuOpen(false);
              }}
            >
              <PlusIcon className="size-6" />
              <span className="text-[10px]">Save polygons</span>
            </button>
          </li>
        </ul>
      </Toolbar>
    </ToolControlMenu>
  );
}

export function ShapeToolInfo() {
  const state =
    useEditorToolState<ShapeToolState>("shape") ?? defaultShapeState;
  const { getTool } = useEditorActions();
  const selectedItem = useEditor((editor) =>
    editor.customShapes.find((item) => item.id === state.shapeId),
  );
  const adjust = (
    field: "ellipseVertices" | "starPoints" | "starInnerRadius",
    delta: number,
  ) => getTool<ShapeTool>("shape")?.adjustOption(field, delta);
  if (state.capturing)
    return (
      <CanvasTipGroup title="Save polygons">
        <CanvasTipSegment>
          Click a polygon or drag around whole polygons
        </CanvasTipSegment>
        <CanvasTipSegment>
          <CanvasTipKeyButton
            onClick={() => getTool<ShapeTool>("shape")?.cancelCapture()}
          >
            Cancel
          </CanvasTipKeyButton>
          <CanvasTipKey>Esc</CanvasTipKey>
        </CanvasTipSegment>
      </CanvasTipGroup>
    );
  return (
    <CanvasTipGroup
      title={
        builtinShapes.find((s) => s.id === state.shapeId)?.name ??
        selectedItem?.name ??
        "Library item"
      }
    >
      {selectedItem && isCompositeLibraryItem(selectedItem) ? (
        <CanvasTipSegment>Original size</CanvasTipSegment>
      ) : (
        <CanvasTipSegment>
          Keep proportions <CanvasTipKey>Shift</CanvasTipKey>
        </CanvasTipSegment>
      )}
      {(state.shapeId === "ellipse" || state.shapeId === "star") && (
        <CanvasTipNumberControl
          label={state.shapeId === "ellipse" ? "Vertices" : "Points"}
          accessibleLabel="shape points"
          min={3}
          max={MAX_SHAPE_POINTS}
          value={
            state.shapeId === "ellipse"
              ? state.ellipseVertices
              : state.starPoints
          }
          onAdjust={(delta) =>
            adjust(
              state.shapeId === "ellipse" ? "ellipseVertices" : "starPoints",
              delta,
            )
          }
        />
      )}
      {state.shapeId === "star" && (
        <CanvasTipNumberControl
          label="Inner radius %"
          accessibleLabel="star inner radius"
          min={1}
          max={99}
          value={state.starInnerRadius}
          decreaseKey="["
          increaseKey="]"
          increaseShortcut="]"
          onAdjust={(delta) => adjust("starInnerRadius", delta)}
        />
      )}
    </CanvasTipGroup>
  );
}

function scrollSelectedShapeIntoView(node: HTMLLIElement | null) {
  node?.scrollIntoView({ block: "nearest" });
}
