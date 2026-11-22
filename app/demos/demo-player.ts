import type { EditorStore } from "~/editor/editor-store";
import type { Position } from "~/editor/elma-types";
import type { VertexTool } from "~/editor/edit-mode/tools/vertex-tool";
import type { AppleToolState } from "~/editor/edit-mode/tools/apple-tools";
import type { PictureToolState } from "~/editor/edit-mode/tools/picture-tool";
import {
  worldToScreen,
  screenToWorld,
} from "~/editor/helpers/coordinate-helpers";
import type { DemoCommand, DemoTool } from "./commands";

export type DemoCursor = Position & { pressed: boolean };
export type DemoStage = {
  tool: DemoTool;
  label: string;
  picture?: string;
};

type DemoPlayerOptions = {
  store: EditorStore;
  signal: AbortSignal;
  onCursor: (cursor: DemoCursor | null) => void;
  onStage: (stage: DemoStage) => void;
  toolbarPosition: (target: DemoTool | "title") => Position;
  playtest: (duration: number) => Promise<void>;
};

/** Executes semantic editor commands, never global DOM input events. */
export class DemoPlayer {
  private cursor: Position = { x: 0, y: 0 };
  private pressed = false;

  constructor(private options: DemoPlayerOptions) {}

  private get state() {
    return this.options.store.getState();
  }

  private async animate(duration: number, update: (progress: number) => void) {
    const { signal } = this.options;
    signal.throwIfAborted();
    const start = performance.now();
    await new Promise<void>((resolve, reject) => {
      let frame: number;
      const abort = () => {
        cancelAnimationFrame(frame);
        reject(signal.reason);
      };
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / Math.max(1, duration));
        try {
          update(progress);
        } catch (error) {
          signal.removeEventListener("abort", abort);
          reject(error);
          return;
        }
        if (progress === 1) {
          signal.removeEventListener("abort", abort);
          resolve();
        } else frame = requestAnimationFrame(tick);
      };
      signal.addEventListener("abort", abort, { once: true });
      frame = requestAnimationFrame(tick);
    });
  }

  private wait(duration: number) {
    return this.animate(duration, () => {});
  }

  private showCursor(position: Position) {
    this.cursor = position;
    this.options.onCursor({ ...position, pressed: this.pressed });
  }

  private async move(to: () => Position, duration = 320, onCanvas = false) {
    const from = this.cursor;
    this.state.actions.setMouseOnCanvas(onCanvas);
    await this.animate(duration, (progress) => {
      const eased = progress * progress * (3 - 2 * progress);
      const target = to();
      const position = {
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
      };
      this.showCursor(position);
      if (onCanvas) {
        const { actions, viewPortOffset, zoom } = this.state;
        actions.setMousePosition(screenToWorld(position, viewPortOffset, zoom));
      }
    });
  }

  private moveWorld(position: Position, duration?: number) {
    return this.move(
      () => worldToScreen(position, this.state.viewPortOffset, this.state.zoom),
      duration,
      true,
    );
  }

  private async click(action: () => void) {
    this.pressed = true;
    this.showCursor(this.cursor);
    action();
    await this.wait(100);
    this.pressed = false;
    this.showCursor(this.cursor);
    await this.wait(100);
  }

  private async select(tool: DemoTool, label: string, picture?: string) {
    await this.move(() => this.options.toolbarPosition(tool));
    await this.click(() => {
      this.options.onStage({ tool, label, picture });
      this.state.actions.activateTool(
        tool === "autoGrass"
          ? "vertex"
          : tool === "preview" || tool === "playtest"
            ? "select"
            : tool,
        tool === "autoGrass"
          ? "autoGrass"
          : tool === "vertex"
            ? "normal"
            : undefined,
      );
    });
  }

  private clickWorld(position: Position, right = false) {
    const screen = worldToScreen(
      position,
      this.state.viewPortOffset,
      this.state.zoom,
    );
    const context = {
      worldPos: position,
      screenX: screen.x,
      screenY: screen.y,
    };
    const tool = this.state.actions.getActiveTool();
    return this.click(() => {
      if (right)
        tool?.onRightClick?.(
          new MouseEvent("contextmenu", { button: 2 }),
          context,
        );
      else
        tool?.onPointerDown?.(
          new PointerEvent("pointerdown", { button: 0 }),
          context,
        );
    });
  }

  private async drag(
    from: Position,
    to: Position,
    update: (position: Position) => void,
  ) {
    await this.moveWorld(from);
    this.pressed = true;
    await this.animate(700, (progress) => {
      const eased = progress * progress * (3 - 2 * progress);
      const position = {
        x: from.x + (to.x - from.x) * eased,
        y: from.y + (to.y - from.y) * eased,
      };
      update(position);
      this.showCursor(
        worldToScreen(position, this.state.viewPortOffset, this.state.zoom),
      );
    });
    this.pressed = false;
    this.showCursor(this.cursor);
    await this.wait(200);
  }

  async run(commands: readonly DemoCommand[]) {
    this.cursor = this.options.toolbarPosition("select");
    this.showCursor(this.cursor);
    for (const command of commands) {
      this.options.signal.throwIfAborted();
      switch (command.type) {
        case "polygon":
          await this.select("vertex", "Draw the terrain");
          for (const vertex of command.vertices) {
            await this.moveWorld(vertex, 240);
            await this.clickWorld(vertex);
          }
          await this.clickWorld(
            command.vertices[command.vertices.length - 1],
            true,
          );
          break;
        case "moveStart":
          await this.select("select", "Move the start");
          await this.drag(this.state.start, command.to, (position) =>
            this.state.actions.setStart(position),
          );
          break;
        case "moveFlower":
          await this.select("select", "Move the flower");
          await this.drag(
            this.state.flowers[command.index],
            command.to,
            (position) => {
              this.state.actions.setFlowers(
                this.state.flowers.map((flower, index) =>
                  index === command.index ? position : flower,
                ),
              );
            },
          );
          break;
        case "apple":
          await this.select("apple", "Place an apple");
          this.state.actions.setToolState<AppleToolState>(
            "apple",
            command.apple,
          );
          await this.moveWorld(command.apple.position);
          await this.clickWorld(command.apple.position);
          break;
        case "autoGrass":
          await this.select("autoGrass", "AutoGrass level");
          this.state.actions.getTool<VertexTool>("vertex")?.autoGrassAll();
          await this.wait(600);
          break;
        case "picture":
          await this.select("picture", "Place pictures", command.picture.name);
          this.state.actions.setToolState<PictureToolState>(
            "picture",
            command.picture,
          );
          await this.moveWorld(command.picture.position, 420);
          await this.clickWorld(command.picture.position);
          break;
        case "title":
          await this.select("select", "Name the level");
          await this.move(() => this.options.toolbarPosition("title"));
          await this.click(() => this.state.actions.setLevelName(""));
          for (let index = 1; index <= command.title.length; index++) {
            this.state.actions.setLevelName(command.title.slice(0, index));
            await this.wait(75);
          }
          await this.wait(350);
          break;
        case "preview":
          await this.select("preview", "Finished level");
          this.state.actions.setLevelVisibility({
            useGroundSkyTextures: true,
            useGrassTextures: true,
            showGroundBounds: false,
            showGrassBounds: false,
            showObjectAnimations: true,
          });
          break;
        case "playtest":
          await this.select("playtest", "Playtest");
          this.options.onCursor(null);
          await this.options.playtest(command.duration);
          break;
        case "wait":
          await this.wait(command.duration);
          break;
      }
      this.state.actions.setMouseOnCanvas(false);
    }
    this.options.onCursor(null);
  }
}
