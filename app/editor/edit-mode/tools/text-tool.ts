import { Tool } from "./tool-interface";
import { defaultTools } from "./default-tools";
import type { EventContext } from "~/editor/helpers/event-handler";
import type { Polygon, Position } from "~/editor/elma-types";
import {
  createTextPolygons,
  defaultTextOptions,
  loadTextFont,
  type TextOptions,
} from "~/editor/helpers/text-polygons";

export type TextToolState = {
  options: TextOptions;
  status: "loading" | "ready" | "error";
  error?: string;
  vertexCount: number;
};

export class TextTool extends Tool<TextToolState> {
  readonly meta = defaultTools.text;
  private polygons: Polygon[] = [];
  private request = 0;

  onActivate() {
    this.updateOptions({});
  }
  onDeactivate() {
    this.request++;
    this.polygons = [];
  }
  getCursor() {
    return "crosshair";
  }

  updateOptions(patch: Partial<TextOptions>) {
    const { toolState, setToolState } = this.getState();
    const options = { ...defaultTextOptions, ...toolState?.options, ...patch };
    const request = ++this.request;
    this.polygons = [];
    setToolState({
      options,
      status: "loading",
      error: undefined,
      vertexCount: 0,
    });
    void loadTextFont(options)
      .then((font) => {
        if (request !== this.request) return;
        this.polygons = createTextPolygons(font, options);
        setToolState({
          status: "ready",
          vertexCount: this.polygons.reduce(
            (sum, polygon) => sum + polygon.vertices.length,
            0,
          ),
        });
      })
      .catch((error) => {
        if (request !== this.request) return;
        this.polygons = [];
        setToolState({
          status: "error",
          error:
            error instanceof Error ? error.message : "Could not create text.",
        });
      });
  }

  private at(position: Position): Polygon[] {
    return this.polygons.map((polygon) => ({
      ...polygon,
      vertices: polygon.vertices.map((point) => ({
        x: point.x + position.x,
        y: point.y + position.y,
      })),
    }));
  }
  onPointerDown(event: PointerEvent, context: EventContext) {
    if (event.button !== 0) return false;
    const { state, toolState } = this.getState();
    if (toolState?.status !== "ready" || !this.polygons.length) return true;
    state.actions.setPolygons([
      ...state.polygons,
      ...this.at(context.worldPos),
    ]);
    return true;
  }
  getDrafts() {
    const { state, toolState } = this.getState();
    if (!state.mouseOnCanvas || toolState?.status !== "ready") return {};
    return { polygons: this.at(state.mousePosition) };
  }
}
