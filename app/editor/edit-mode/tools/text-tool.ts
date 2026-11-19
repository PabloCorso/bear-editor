import { Tool } from "./tool-interface";
import { defaultTools } from "./default-tools";
import type { EventContext } from "~/editor/helpers/event-handler";
import type { Font } from "opentype.js";
import type { Polygon, Position } from "~/editor/elma-types";
import {
  createTextPolygons,
  defaultTextOptions,
  getTextCaretMetrics,
  getTextLayoutBounds,
  textHasCurves,
  type TextOptions,
} from "~/editor/helpers/text-polygons";
import { loadTextFont } from "~/editor/helpers/text-fonts";
import type { SelectToolState } from "./select-tool";

export const TEXT_PLACEHOLDER = "Type something...";
const TEXT_PLACEHOLDER_OPACITY = 0.4;

type TextDraft = {
  position: Position;
};

type TextResizeAnchor = {
  fixed: Position;
  horizontal: "left" | "right";
  vertical: "top" | "bottom";
};

export type TextToolState = {
  options: TextOptions;
  status: "loading" | "ready" | "error";
  error?: string;
  vertexCount: number;
  polygonCount: number;
  curveDetailAvailable: boolean;
  draft?: TextDraft;
  bounds?: { width: number; height: number };
};

export class TextTool extends Tool<TextToolState> {
  readonly meta = defaultTools.text;
  private polygons: Polygon[] = [];
  private previewPolygons: Polygon[] = [];
  private request = 0;
  private commitWhenReady = false;
  private nextResizeAnchor?: TextResizeAnchor;
  private font?: Font;
  private fontId?: string;

  onActivate() {
    this.updateOptions({ text: "" });
  }
  onDeactivate() {
    this.request++;
    this.commitWhenReady = false;
    this.polygons = [];
    this.previewPolygons = [];
    this.getState().setToolState({ draft: undefined });
  }
  isInteracting(): boolean {
    return !!this.getState().toolState?.draft;
  }
  clear() {
    this.commitWhenReady = false;
    this.nextResizeAnchor = undefined;
    this.getState().setToolState({ draft: undefined });
  }
  getCursor() {
    return "text";
  }

  getCaretMetrics(offset: number) {
    const options = this.getState().toolState?.options;
    if (!options || !this.font || this.fontId !== options.fontId) return;
    return getTextCaretMetrics(this.font, options, offset);
  }

  updateOptions(patch: Partial<TextOptions>) {
    const { toolState, setToolState } = this.getState();
    const options = { ...defaultTextOptions, ...toolState?.options, ...patch };
    const request = ++this.request;
    const resizeAnchor = this.nextResizeAnchor;
    this.nextResizeAnchor = undefined;
    this.commitWhenReady = false;
    setToolState({
      options,
      status: "loading",
      error: undefined,
      vertexCount: 0,
      polygonCount: 0,
      curveDetailAvailable: false,
    });
    void loadTextFont(options.fontId)
      .then((font) => {
        if (request !== this.request) return;
        this.font = font;
        this.fontId = options.fontId;
        this.polygons = createTextPolygons(font, options);
        this.previewPolygons = options.text.trim()
          ? this.polygons
          : createTextPolygons(font, {
              ...options,
              text: TEXT_PLACEHOLDER,
            });
        const previewText = options.text.trim()
          ? options.text
          : TEXT_PLACEHOLDER;
        const bounds = getTextLayoutBounds(font, {
          ...options,
          text: previewText,
        });
        const draft =
          resizeAnchor && bounds && this.getState().toolState?.draft
            ? {
                position: {
                  x:
                    resizeAnchor.horizontal === "left"
                      ? resizeAnchor.fixed.x - bounds.width
                      : resizeAnchor.fixed.x,
                  y:
                    resizeAnchor.vertical === "top"
                      ? resizeAnchor.fixed.y - bounds.height
                      : resizeAnchor.fixed.y,
                },
              }
            : undefined;
        setToolState({
          status: "ready",
          vertexCount: this.polygons.reduce(
            (sum, polygon) => sum + polygon.vertices.length,
            0,
          ),
          polygonCount: this.polygons.length,
          curveDetailAvailable: textHasCurves(font, {
            ...options,
            text: previewText,
          }),
          bounds,
          ...(draft ? { draft } : {}),
        });
        if (this.commitWhenReady) this.finishCommit();
      })
      .catch((error) => {
        if (request !== this.request) return;
        this.polygons = [];
        this.previewPolygons = [];
        setToolState({
          status: "error",
          error:
            error instanceof Error ? error.message : "Could not create text.",
        });
      });
  }

  beginEditing(position: Position) {
    this.getState().setToolState({ draft: { position } });
    this.updateOptions({ text: "" });
  }

  resizeDraft(size: number, anchor: TextResizeAnchor) {
    if (!this.getState().toolState?.draft) return;
    this.nextResizeAnchor = anchor;
    this.updateOptions({ size });
  }

  commit() {
    const { toolState } = this.getState();
    if (!toolState?.draft) return;
    if (!toolState.options.text.trim()) {
      this.cancel();
      return;
    }
    if (toolState.status === "loading") {
      this.commitWhenReady = true;
      return;
    }
    if (toolState.status === "ready") this.finishCommit();
  }

  cancel() {
    const { state, setToolState } = this.getState();
    this.commitWhenReady = false;
    setToolState({ draft: undefined });
    state.actions.activateTool("select");
  }

  private finishCommit() {
    const { state, toolState, setToolState } = this.getState();
    if (!toolState?.draft || !this.polygons.length) return;
    const placed = this.at(toolState.draft.position);
    setToolState({ draft: undefined });
    this.edit("text.place", () => {
      state.actions.setPolygons([...state.polygons, ...placed]);
      state.actions.activateTool("select");
      state.actions.setToolState<SelectToolState>("select", {
        selectedVertices: placed.flatMap((polygon) =>
          polygon.vertices.map((vertex) => ({ polygon, vertex })),
        ),
        selectedObjects: [],
        selectedPictures: [],
        isDragging: false,
        isMarqueeSelecting: false,
        transformMode: false,
        skewMode: false,
        hoveredObject: undefined,
        hoveredPictureBounds: undefined,
        contextMenuType: undefined,
        contextMenuPosition: undefined,
      });
    });
  }

  private at(position: Position, polygons = this.polygons): Polygon[] {
    return polygons.map((polygon) => ({
      ...polygon,
      vertices: polygon.vertices.map((point) => ({
        x: point.x + position.x,
        y: point.y + position.y,
      })),
    }));
  }
  onPointerDown(event: PointerEvent, context: EventContext) {
    if (event.button !== 0) return false;
    const { toolState } = this.getState();
    if (toolState?.draft) {
      this.commit();
      return true;
    }
    if (toolState?.status !== "ready") return true;
    const position = this.snapPosition(context.worldPos, event.altKey);
    this.beginEditing(position);
    return true;
  }
  getDrafts() {
    const { state, toolState } = this.getState();
    if (
      !toolState ||
      toolState.status === "error" ||
      (toolState.status === "loading" && !this.previewPolygons.length)
    )
      return {};
    if (toolState.draft) {
      return {
        polygons: this.at(toolState.draft.position, this.previewPolygons),
        polygonOpacity: toolState.options.text.trim()
          ? 1
          : TEXT_PLACEHOLDER_OPACITY,
      };
    }
    if (!state.mouseOnCanvas || !toolState.options.text.trim()) return {};
    return {
      polygons: this.at(
        this.snapPosition(state.mousePosition),
        this.previewPolygons,
      ),
    };
  }
}
