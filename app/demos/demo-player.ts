import type { EditorStore } from "~/editor/editor-store";
import type { Position } from "~/editor/elma-types";
import type { EditorEngine } from "~/editor/edit-mode/engine/editor-engine";
import type { VertexToolState } from "~/editor/edit-mode/tools/vertex-tool";
import type { AppleToolState } from "~/editor/edit-mode/tools/apple-tools";
import type { PictureToolState } from "~/editor/edit-mode/tools/picture-tool";
import { worldToScreen } from "~/editor/helpers/coordinate-helpers";
import type { DemoCommand } from "./commands";

export type DemoCursor = Position & { pressed: boolean };
export type DemoStage = {
  label: string;
};

type DemoPlayerOptions = {
  store: EditorStore;
  signal: AbortSignal;
  onCursor: (cursor: DemoCursor | null) => void;
  onStage: (stage: DemoStage) => void;
  surface: HTMLElement;
  canvas: HTMLCanvasElement;
  engine: EditorEngine;
  setPlaytestDuration: (duration: number) => void;
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
        this.pointer("move", position);
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

  private positionOf(element: HTMLElement): Position {
    const rect = element.getBoundingClientRect();
    const bounds = this.options.surface.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - bounds.left,
      y: rect.top + rect.height / 2 - bounds.top,
    };
  }

  private control(label: string): HTMLElement {
    const elements = this.options.surface.querySelectorAll<HTMLElement>(
      "button[aria-label], input[name]",
    );
    const element = Array.from(elements).find((candidate) => {
      const name =
        candidate.getAttribute("aria-label") ?? candidate.getAttribute("name");
      return name === label && candidate.getClientRects().length > 0;
    });
    if (!element) throw new Error(`Demo control not found: ${label}`);
    return element;
  }

  private async clickControl(label: string, action?: () => void) {
    const control = this.control(label);
    control.scrollIntoView({ block: "nearest", inline: "nearest" });
    await this.move(() => this.positionOf(control));
    await this.click(action ?? (() => control.click()));
  }

  private async select(
    tool: "select" | "vertex" | "apple" | "picture",
    label: string,
  ) {
    this.options.onStage({ label });
    const active = this.state.activeToolId === tool;
    if (
      active &&
      (tool !== "vertex" ||
        this.state.actions.getToolState<VertexToolState>("vertex")?.variant ===
          "normal")
    )
      return;
    switch (tool) {
      case "select":
        await this.clickControl("Select tool (S)");
        await this.clickControl("Marquee");
        break;
      case "vertex":
        await this.clickControl("Vertex tools");
        await this.clickControl("Vertex (V)");
        break;
      case "apple":
        await this.clickControl("Objects (A / K / F)");
        break;
      case "picture":
        await this.clickControl("Picture (P)");
        break;
    }
  }

  private pointer(phase: "down" | "move" | "up", position: Position) {
    const bounds = this.options.canvas.getBoundingClientRect();
    if (phase === "down") this.state.actions.setToolMenuOpen(false);
    this.options.engine.dispatchToolPointerEvent(
      phase,
      new PointerEvent(`pointer${phase}`, {
        pointerType: "mouse",
        button: 0,
        buttons: phase === "up" || !this.pressed ? 0 : 1,
        clientX: bounds.left + position.x,
        clientY: bounds.top + position.y,
      }),
    );
  }

  private async clickWorld(position: Position, right = false) {
    const screen = worldToScreen(
      position,
      this.state.viewPortOffset,
      this.state.zoom,
    );
    await this.click(() => {
      if (right) {
        this.state.actions
          .getActiveTool()
          ?.onRightClick?.(new MouseEvent("contextmenu", { button: 2 }), {
            worldPos: position,
            screenX: screen.x,
            screenY: screen.y,
          });
      } else {
        this.pointer("down", screen);
        this.pointer("up", screen);
      }
    });
  }

  private async drag(from: Position, to: Position) {
    await this.moveWorld(from);
    this.pressed = true;
    this.pointer("down", this.cursor);
    await this.moveWorld(to, 700);
    this.pointer("up", this.cursor);
    this.pressed = false;
    this.showCursor(this.cursor);
    await this.wait(200);
  }

  async run(commands: readonly DemoCommand[]) {
    this.cursor = this.positionOf(this.control("Select tool (S)"));
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
          await this.drag(this.state.start, command.to);
          break;
        case "moveFlower":
          await this.select("select", "Move the flower");
          await this.drag(this.state.flowers[command.index], command.to);
          break;
        case "apple":
          await this.select("apple", "Place an apple");
          if (this.state.openToolMenuId === "apple") {
            await this.clickControl(
              `Apple animation ${command.apple.animation}`,
            );
          }
          this.state.actions.setToolState<AppleToolState>(
            "apple",
            command.apple,
          );
          await this.moveWorld(command.apple.position);
          await this.clickWorld(command.apple.position);
          break;
        case "autoGrass":
          this.options.onStage({ label: "AutoGrass level" });
          if (this.state.openToolMenuId !== "vertex")
            await this.clickControl("Vertex tools");
          await this.clickControl("AutoGrass level");
          await this.wait(600);
          break;
        case "picture":
          await this.select("picture", "Place pictures");
          if (
            this.state.openToolMenuId === "picture" ||
            this.state.actions.getToolState<PictureToolState>("picture")
              ?.name !== command.picture.name
          ) {
            if (this.state.openToolMenuId !== "picture")
              await this.clickControl("Picture (P)");
            await this.clickControl(command.picture.name);
          }
          this.state.actions.setToolState<PictureToolState>(
            "picture",
            command.picture,
          );
          await this.moveWorld(command.picture.position, 420);
          await this.clickWorld(command.picture.position);
          break;
        case "title":
          await this.select("select", "Name the level");
          await this.clickControl("level-name", () =>
            this.state.actions.setLevelName(""),
          );
          for (let index = 1; index <= command.title.length; index++) {
            this.state.actions.setLevelName(command.title.slice(0, index));
            await this.wait(75);
          }
          await this.wait(350);
          break;
        case "preview":
          this.options.onStage({ label: "Finished level" });
          this.state.actions.setLevelVisibility({
            useGroundSkyTextures: true,
            useGrassTextures: true,
            showGroundBounds: false,
            showGrassBounds: false,
            showObjectAnimations: true,
          });
          break;
        case "playtest":
          this.options.onStage({ label: "Playtest" });
          this.options.setPlaytestDuration(command.duration);
          await this.clickControl("Play mode (Enter)");
          this.options.onCursor(null);
          if (!this.state.isPlayMode)
            throw new Error("Could not start playtest");
          while (this.state.isPlayMode) await this.wait(100);
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
