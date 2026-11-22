import type { LgrAssets } from "~/components/lgr-assets";
import type { EditorStore } from "~/editor/editor-store";
import { elmaLevelFromEditorState } from "~/editor/helpers/level-parser";
import { convertLevelToGameData } from "~/editor/play-mode/level-converter";
import {
  createGame,
  gameFrame,
} from "~/editor/play-mode/engine/game/game-loop";
import {
  DEFAULT_KEYS,
  InputManager,
} from "~/editor/play-mode/engine/input-manager";
import { PlayModeSceneRenderer } from "~/editor/play-mode/scene/play-mode-scene-renderer";

/** A short, self-contained ride using the normal game engine and renderer. */
export async function playDemoRide(
  canvas: HTMLCanvasElement,
  store: EditorStore,
  assets: LgrAssets,
  duration: number,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const state = store.getState();
  const level = convertLevelToGameData(elmaLevelFromEditorState(state));
  const renderer = new PlayModeSceneRenderer(canvas, assets);
  const input = new InputManager([], [], false);
  let observer: ResizeObserver | undefined;
  try {
    const game = createGame(level, input);
    game.camera.zoom = 0.9;
    renderer.resize();
    observer = new ResizeObserver(() => renderer.resize());
    observer.observe(canvas);
    await new Promise<void>((resolve, reject) => {
      let frame: number;
      const abort = () => {
        cancelAnimationFrame(frame);
        reject(signal.reason);
      };
      const start = performance.now();
      const tick = (timestamp: number) => {
        try {
          const elapsed = timestamp - start;
          if (elapsed > 300) input.pressKey(DEFAULT_KEYS.gas);
          gameFrame(game, timestamp);
          renderer.render(game, state.playSettings, state);
          input.update();
          if (elapsed >= duration) {
            signal.removeEventListener("abort", abort);
            resolve();
          } else frame = requestAnimationFrame(tick);
        } catch (error) {
          signal.removeEventListener("abort", abort);
          reject(error);
        }
      };
      signal.addEventListener("abort", abort, { once: true });
      frame = requestAnimationFrame(tick);
    });
  } finally {
    observer?.disconnect();
    input.destroy();
    renderer.destroy();
  }
}
