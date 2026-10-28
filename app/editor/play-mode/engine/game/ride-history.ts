import { Vec2 } from "../core/vec2";
import { GAME_TIME_PER_SECOND } from "../core/constants";
import type { MotorState } from "../physics/motor-state";
import type { Rigidbody } from "../physics/rigidbody";
import type { GameState } from "./game-loop";
import { updateCamera } from "./camera";

type RideSnapshot = Pick<
  GameState,
  | "motor"
  | "gameTime"
  | "accumulator"
  | "result"
  | "winTime"
  | "lastVoltTime"
  | "lastVoltDirection"
  | "lastTurnTime"
  | "flipFactor"
  | "cameraFlipFactor"
> & { collected: ReadonlySet<string> };

/** Immutable prefixes are shared by captured starts and independent attempts.
 * A class keeps the long chain opaque to the editor's deep-equality checks.
 * No browser resources, terrain, or live input belong in this history.
 */
export class RideMoment {
  constructor(
    readonly snapshot: RideSnapshot,
    readonly previous: RideMoment | null,
  ) {}

  valueOf(): object {
    return this;
  }
}

function cloneBody(body: Rigidbody): Rigidbody {
  return { ...body, r: body.r.clone(), v: body.v.clone() };
}

function cloneMotor(motor: MotorState): MotorState {
  return {
    ...motor,
    bike: cloneBody(motor.bike),
    leftWheel: cloneBody(motor.leftWheel),
    rightWheel: cloneBody(motor.rightWheel),
    headR: motor.headR.clone(),
    bodyR: motor.bodyR.clone(),
    bodyV: motor.bodyV.clone(),
  };
}

function appleKey(x: number, y: number): string {
  return `${x},${y}`;
}

function capture(state: GameState, previous: RideMoment | null): RideMoment {
  const collected = new Set<string>();
  for (const object of state.level.objects) {
    if (object.type === "food" && !object.active) {
      collected.add(appleKey(object.r.x, object.r.y));
    }
  }
  const oldCollected = previous?.snapshot.collected;
  const sameCollected =
    oldCollected?.size === collected.size &&
    [...collected].every((key) => oldCollected.has(key));
  return new RideMoment(
    {
      motor: cloneMotor(state.motor),
      gameTime: state.gameTime,
      accumulator: state.accumulator,
      result: state.result,
      winTime: state.winTime,
      lastVoltTime: state.lastVoltTime,
      lastVoltDirection: state.lastVoltDirection,
      lastTurnTime: state.lastTurnTime,
      flipFactor: state.flipFactor,
      cameraFlipFactor: state.cameraFlipFactor,
      collected: sameCollected ? oldCollected : collected,
    },
    previous,
  );
}

function restore(state: GameState, moment: RideMoment): void {
  const { collected, motor, ...timing } = moment.snapshot;
  Object.assign(state, timing);
  state.motor = cloneMotor(motor);
  // Match the current world by apple position, never by the sorted array index.
  // Moved/new apples are available; removed apples contribute no collected count.
  state.appleCount = 0;
  state.requiredApples = 0;
  for (const object of state.level.objects) {
    if (object.type !== "food") continue;
    state.requiredApples++;
    object.active = !collected.has(appleKey(object.r.x, object.r.y));
    if (!object.active) state.appleCount++;
  }
  state.motor.appleCount = state.appleCount;
  // Events are frame-local. Death/finish may leave a partially drained queue.
  // Reusing it would collect an object or apply a gravity change a second time.
  state.eventBuffer.reset();
  updateCamera(state.camera, state.motor.bike.r.x, state.motor.bike.r.y);
}

function mixVector(a: Vec2, b: Vec2, amount: number): Vec2 {
  return new Vec2(a.x + (b.x - a.x) * amount, a.y + (b.y - a.y) * amount);
}

function mixAngle(a: number, b: number, amount: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * amount;
}

/** Interpolation is display-only; continuation always restores a real snapshot. */
function interpolatePose(
  state: GameState,
  later: RideMoment,
  time: number,
): void {
  const earlier = state.gameTime;
  const duration = later.snapshot.gameTime - earlier;
  if (duration <= 0) return;
  const amount = Math.max(0, Math.min(1, (time - earlier) / duration));
  const motor = state.motor;
  const next = later.snapshot.motor;
  for (const name of ["bike", "leftWheel", "rightWheel"] as const) {
    motor[name].r = mixVector(motor[name].r, next[name].r, amount);
    motor[name].rotation = mixAngle(
      motor[name].rotation,
      next[name].rotation,
      amount,
    );
  }
  motor.bodyR = mixVector(motor.bodyR, next.bodyR, amount);
  motor.headR = mixVector(motor.headR, next.headR, amount);
  state.gameTime = earlier + duration * amount;
  updateCamera(state.camera, motor.bike.r.x, motor.bike.r.y);
}

export class RideHistory {
  private moment: RideMoment;
  private rewindTime: number | null = null;
  private later: RideMoment | null = null;

  constructor(state: GameState, start?: RideMoment) {
    this.moment = start ?? capture(state, null);
    if (start) restore(state, start);
  }

  get rewinding(): boolean {
    return this.rewindTime !== null;
  }

  get canRewind(): boolean {
    return this.moment.previous !== null;
  }

  record(state: GameState): void {
    if (state.gameTime > this.moment.snapshot.gameTime) {
      this.moment = capture(state, this.moment);
    }
  }

  rewind(state: GameState, wallSeconds: number): void {
    this.rewindTime ??= this.moment.snapshot.gameTime;
    this.rewindTime -= Math.max(0, wallSeconds) * GAME_TIME_PER_SECOND;
    while (
      this.moment.previous &&
      this.moment.snapshot.gameTime > this.rewindTime
    ) {
      this.later = this.moment;
      this.moment = this.moment.previous;
    }
    this.rewindTime = Math.max(this.moment.snapshot.gameTime, this.rewindTime);
    restore(state, this.moment);
    if (this.later) interpolatePose(state, this.later, this.rewindTime);
  }

  resume(state: GameState, timestamp: number): void {
    if (!this.rewinding) return;
    restore(state, this.moment);
    this.rewindTime = null;
    this.later = null;
    state.lastTimestamp = timestamp;
    state.input.update();
  }

  /** Capturing an interpolated preview selects its exact preceding state. */
  captureStart(): RideMoment {
    return this.moment;
  }
}
