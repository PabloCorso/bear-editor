import { gameFrame, type GameState } from "./engine/game/game-loop";

type RideControl =
  | "gas"
  | "brake"
  | "turn"
  | "leftVolt"
  | "rightVolt"
  | "alovolt";

export type ScriptedRide = {
  durationMs: number;
  steps: readonly { at: number; controls: readonly RideControl[] }[];
};

const controls: readonly RideControl[] = [
  "gas",
  "brake",
  "turn",
  "leftVolt",
  "rightVolt",
  "alovolt",
];
const STEP_MS = 16;
const RESULT_HOLD_MS = 1500;

/** Advance scripted input on a fixed clock independently of the display FPS. */
export class ScriptedRidePlayer {
  private elapsed = 0;
  private nextTimestamp = 1;
  private step = 0;
  private endedAt?: number;

  constructor(
    private ride: ScriptedRide,
    private game: GameState,
  ) {
    game.lastTimestamp = 0;
  }

  advance(deltaMs: number): boolean {
    this.elapsed += deltaMs;
    const { game, ride } = this;
    while (this.nextTimestamp <= this.elapsed && game.result === "playing") {
      const timestamp = this.nextTimestamp;
      while (
        this.step < ride.steps.length &&
        ride.steps[this.step].at <= timestamp
      ) {
        const active = ride.steps[this.step++].controls;
        for (const control of controls) {
          const key = game.keys[control];
          if (active.includes(control)) game.input.pressKey(key);
          else game.input.releaseKey(key);
        }
      }
      gameFrame(game, timestamp);
      game.input.update();
      this.nextTimestamp += STEP_MS;
    }
    if (game.result !== "playing") {
      this.endedAt ??= this.elapsed;
      return this.elapsed - this.endedAt >= RESULT_HOLD_MS;
    }
    return this.elapsed >= ride.durationMs;
  }
}
