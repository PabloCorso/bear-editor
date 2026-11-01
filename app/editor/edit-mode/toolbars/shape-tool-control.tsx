import {
  PlusIcon,
  DotsThreeVerticalIcon,
} from "@phosphor-icons/react/dist/ssr";
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
  shapeBounds,
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "~/components/ui/dropdown-menu";
import {
  CanvasTipGroup,
  CanvasTipSegment,
  CanvasTipKey,
  CanvasTipNumberControl,
  CanvasTipKeyButton,
} from "./canvas-tip";
import { cn } from "~/utils/misc";

// Toolbar icons always use the default geometry, independently of the draft.
const builtinShapeItems = builtinShapes.map((shape) => ({
  ...shape,
  polygons: createShapePolygons({
    shape: shape.id,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  }),
}));

export function ShapePreview({
  polygons,
  className,
}: {
  polygons: Polygon[];
  className?: string;
}) {
  const bounds = shapeBounds(polygons);
  if (!bounds.width || !bounds.height || !Number.isFinite(bounds.width))
    return null;
  const pad = Math.max(bounds.width, bounds.height) * 0.08;
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
  const selected = items.find((s) => s.id === toolState.shapeId) ?? items[0];
  const tool = () => getTool<ShapeTool>("shape");
  return (
    <ToolControlMenu
      id="shape"
      button={
        <ToolControlButton
          {...defaultTools.shape}
          {...props}
          name={selected.name}
        >
          <ShapePreview polygons={selected.polygons} className="h-6 w-6" />
        </ToolControlButton>
      }
    >
      <Toolbar
        orientation="vertical"
        className="w-[112px] gap-1 p-1"
        aria-label="Shapes"
      >
        <ul className="flex w-full flex-col gap-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="relative"
              ref={
                item.id === toolState.shapeId
                  ? scrollSelectedShapeIntoView
                  : undefined
              }
            >
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
                  "flex w-full cursor-pointer flex-col items-center gap-1 rounded p-2 text-secondary hover:bg-primary-hover/50 hover:text-primary focus-visible:focus-ring",
                  !toolState.capturing &&
                    item.id === toolState.shapeId &&
                    "bg-primary-hover/50 text-primary",
                )}
              >
                <span className="max-w-full truncate text-[10px] font-medium">
                  {item.name}
                </span>
                <ShapePreview polygons={item.polygons} />
              </button>
              {item.custom && (
                <>
                  <input
                    key={item.name}
                    aria-label={`Rename ${item.name}`}
                    defaultValue={item.name}
                    maxLength={80}
                    className="mt-1 w-full rounded border border-separator bg-transparent px-1 text-center text-[10px]"
                    onBlur={(event) => {
                      const name = event.target.value.trim() || item.name;
                      setCustomShapes(
                        shapes.map((s) =>
                          s.id === item.id ? { ...s, name } : s,
                        ),
                      );
                      event.target.value = name;
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger>
                      <button
                        type="button"
                        aria-label={`Options for ${item.name}`}
                        className="absolute top-5 right-0 rounded p-1 hover:bg-primary-hover"
                      >
                        <DotsThreeVerticalIcon />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right">
                      <DropdownMenuItem
                        onClick={() => {
                          if (item.id === toolState.shapeId)
                            tool()?.selectShape("ellipse");
                          setCustomShapes(
                            shapes.filter((s) => s.id !== item.id),
                          );
                        }}
                      >
                        Delete shape
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </li>
          ))}
          <li>
            <button
              type="button"
              aria-label="Add custom shape"
              aria-pressed={toolState.capturing}
              className={cn(
                "flex h-20 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed border-separator text-secondary hover:bg-primary-hover/50 focus-visible:focus-ring",
                toolState.capturing && "bg-primary-hover/50",
              )}
              onClick={() => {
                tool()?.startCapture();
                setToolMenuOpen(false);
              }}
            >
              <PlusIcon className="size-7" />
              <span className="text-[10px]">Add shape</span>
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
  const adjust = (
    field: "ellipseVertices" | "starPoints" | "starInnerRadius",
    delta: number,
  ) => getTool<ShapeTool>("shape")?.adjustOption(field, delta);
  if (state.capturing)
    return (
      <CanvasTipGroup title="Add shape">
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
        "Custom shape"
      }
    >
      <CanvasTipSegment>Drag or click twice</CanvasTipSegment>
      <CanvasTipSegment>
        Keep proportions <CanvasTipKey>Shift</CanvasTipKey>
      </CanvasTipSegment>
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
