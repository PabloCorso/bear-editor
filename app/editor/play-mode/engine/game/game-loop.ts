/**
 * Main game loop with fixed-step accumulator.
 * Ported from LEJATSZO.CPP
 */
import { Vec2 } from "../core/vec2";
import {
  PHYSICS_DT,
  TIME_TO_CENTISECONDS,
  VOLT_DELAY,
} from "../core/constants";
import {
  MotorGravity,
  createMotorState,
  initMotor,
  type MotorState,
} from "../physics/motor-state";
import { Segments } from "../physics/segments";
import {
  step,
  resetStepper,
  calculateHeadPosition,
  checkCollisions,
} from "../physics/stepper";
import { EventBuffer, WavEvent } from "./event-buffer";
import { InputManager, type KeyBindings, DEFAULT_KEYS } from "../input-manager";
import { createCamera, updateCamera, type Camera } from "./camera";
import type { LevelData, ObjectProperty } from "../level";
import { sortObjects, initializeObjects } from "../level";

type GameResult = "playing" | "dead" | "won" | "escaped";
const MIN_CAMERA_ZOOM = 0.2;
const MAX_CAMERA_ZOOM = 5;
const CAMERA_ZOOM_STEP = 20;
const KEYBOARD_ZOOM_STEP_DIVISOR = 100;

export interface GameState {
  motor: MotorState;
  segments: Segments;
  level: LevelData;
  eventBuffer: EventBuffer;
  camera: Camera;
  input: InputManager;
  keys: KeyBindings;

  gameTime: number;
  accumulator: number;
  lastTimestamp: number;
  result: GameResult;
  winTime: number; // centiseconds, 0 if not won
  appleCount: number;
  requiredApples: number;

  // Animation state
  lastVoltTime: number;
  lastVoltDirection: "right" | "left" | null;
  lastTurnTime: number;
  flipFactor: number;
  cameraFlipFactor: number;

  // State flags
  running: boolean;
  paused: boolean;
}

/** Initialize a new game */
export function createGame(
  level: LevelData,
  input: InputManager,
  keys?: KeyBindings,
): GameState {
  const motor = createMotorState();
  initMotor(motor);

  // Prepare level for gameplay
  const gameObjects = level.objects.map((obj) => ({ ...obj }));

  // Sort objects: Killer, Food, Exit, Start
  sortObjects(gameObjects);

  // Flip objects Y for physics space
  for (const obj of gameObjects) {
    obj.r = new Vec2(obj.r.x, -obj.r.y);
  }

  // Initialize objects and find start position
  const { appleCount, offset } = initializeObjects(
    gameObjects,
    motor.leftWheel.r,
  );

  // Move bike to start position
  motor.bike.r = motor.bike.r.add(offset);
  motor.leftWheel.r = motor.leftWheel.r.add(offset);
  motor.rightWheel.r = motor.rightWheel.r.add(offset);
  motor.bodyR = motor.bodyR.add(offset);
  calculateHeadPosition(motor);

  // Create game level data with flipped objects
  const gameLevel: LevelData = { ...level, objects: gameObjects };

  // Build collision segments
  const segments = new Segments(gameLevel);
  segments.setupCollisionGrid(0.4); // max wheel radius

  const camera = createCamera();
  updateCamera(camera, motor.bike.r.x, motor.bike.r.y);

  // Set camera bounds from level geometry
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const poly of level.polygons) {
    for (const v of poly.vertices) {
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
  }
  camera.minX = minX;
  camera.maxX = maxX;
  camera.minY = -maxY;
  camera.maxY = -minY;

  const state: GameState = {
    motor,
    segments,
    level: gameLevel,
    eventBuffer: new EventBuffer(),
    camera,
    input,
    keys: keys ?? DEFAULT_KEYS,
    gameTime: 0,
    accumulator: 0,
    lastTimestamp: 0,
    result: "playing",
    winTime: 0,
    appleCount: 0,
    requiredApples: appleCount,
    lastVoltTime: -100,
    lastVoltDirection: null,
    lastTurnTime: -1000,
    flipFactor: 1.0,
    cameraFlipFactor: 1.0,
    running: true,
    paused: false,
  };

  resetStepper(motor);
  motor.appleCount = 0;

  return state;
}

/** Process one physics step */
function physicsStep(state: GameState, dt: number): void {
  const { motor, segments, eventBuffer, keys, input } = state;

  // Check for volt input
  let rightVolt = false;
  let leftVolt = false;
  const alovolt = input.isDown(keys.alovolt);
  if (state.gameTime > state.lastVoltTime + VOLT_DELAY) {
    if (input.isDown(keys.rightVolt) || alovolt) {
      rightVolt = true;
      state.lastVoltTime = state.gameTime;
      state.lastVoltDirection = "right";
      eventBuffer.add(WavEvent.RightVolt, 0.99, -1);
    }
    if (input.isDown(keys.leftVolt) || alovolt) {
      leftVolt = true;
      state.lastVoltTime = state.gameTime;
      state.lastVoltDirection = "left";
      eventBuffer.add(WavEvent.LeftVolt, 0.99, -1);
    }
  }

  // Step physics
  step(
    motor,
    state.gameTime,
    dt,
    input.isDown(keys.gas),
    input.isDown(keys.brake),
    rightVolt,
    leftVolt,
    segments,
    eventBuffer,
  );

  // Check death/objects
  const result = checkCollisions(
    motor,
    state.level.objects,
    segments,
    eventBuffer,
    false,
  );
  if (result === 0) {
    // Dead
    state.result = "dead";
    return;
  }

  // Process events from event buffer
  let evt;
  while ((evt = eventBuffer.get()) !== null) {
    if (evt.objectId >= 0) {
      const obj = state.level.objects[evt.objectId]!;
      if (obj.type === "killer") {
        state.result = "dead";
        return;
      }
      if (obj.type === "food") {
        obj.active = false;
        state.appleCount++;
        motor.appleCount = state.appleCount;
        motor.lastAppleTime = Math.round(state.gameTime * TIME_TO_CENTISECONDS);
        // Handle gravity apples
        applyAppleProperty(motor, obj.property);
      }
      if (obj.type === "exit") {
        if (state.appleCount >= state.requiredApples) {
          state.winTime = Math.round(state.gameTime * TIME_TO_CENTISECONDS);
          state.result = "won";
          return;
        }
      }
    }
  }
}

function applyAppleProperty(motor: MotorState, property: ObjectProperty): void {
  switch (property) {
    case "gravity_up":
      motor.gravityDirection = MotorGravity.Up;
      break;
    case "gravity_down":
      motor.gravityDirection = MotorGravity.Down;
      break;
    case "gravity_left":
      motor.gravityDirection = MotorGravity.Left;
      break;
    case "gravity_right":
      motor.gravityDirection = MotorGravity.Right;
      break;
  }
}

/** Main frame callback - called via requestAnimationFrame */
export function gameFrame(state: GameState, timestamp: number): void {
  if (!state.running) return;

  // Initialize timestamp on first frame
  if (state.lastTimestamp === 0) {
    state.lastTimestamp = timestamp;
    return;
  }

  // Calculate wall time delta
  const wallDt = (timestamp - state.lastTimestamp) / 1000; // seconds
  state.lastTimestamp = timestamp;

  // Don't run physics if game is over
  if (state.result !== "playing") return;

  const { input, keys, motor } = state;

  // Handle escape
  if (input.isDown(keys.escape)) {
    state.result = "escaped";
    return;
  }

  // Handle turn
  if (input.wasJustPressed(keys.turn)) {
    motor.flippedBike = !motor.flippedBike;
    state.lastTurnTime = state.gameTime;
    calculateHeadPosition(motor);
  }

  if (input.isDown(keys.zoomIn)) {
    const stepFactor = 1 + CAMERA_ZOOM_STEP / KEYBOARD_ZOOM_STEP_DIVISOR;
    state.camera.zoom = Math.min(
      MAX_CAMERA_ZOOM,
      state.camera.zoom * stepFactor,
    );
  }
  if (input.isDown(keys.zoomOut)) {
    const stepFactor = 1 + CAMERA_ZOOM_STEP / KEYBOARD_ZOOM_STEP_DIVISOR;
    state.camera.zoom = Math.max(
      MIN_CAMERA_ZOOM,
      state.camera.zoom / stepFactor,
    );
  }

  // Cap max delta to prevent spiral of death (100ms max)
  const cappedDt = Math.min(wallDt, 0.1);

  // Convert wall time (seconds) to game time units
  // game_time = wall_seconds * 1000 * 0.182 * 0.0024
  // = wall_seconds * 1000 * 0.182 * 0.0024
  // = wall_seconds * 0.4368
  const gameTimeDelta = cappedDt * 1000.0 * 0.182 * 0.0024;
  state.accumulator += gameTimeDelta;

  // Fixed timestep physics loop
  while (state.accumulator > 1e-6 && state.result === "playing") {
    const dt = Math.min(PHYSICS_DT, state.accumulator);
    physicsStep(state, dt);
    state.gameTime += dt;
    state.accumulator -= dt;
  }

  // Update camera
  updateCamera(state.camera, motor.bike.r.x, motor.bike.r.y);
}

/** Format time in centiseconds to "MM:SS.CC" string */
export function formatTime(centiseconds: number): string {
  const totalSeconds = Math.floor(centiseconds / 100);
  const cs = Math.floor(centiseconds % 100);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

/** Get current game time in centiseconds */
export function getTimeCentiseconds(state: GameState): number {
  return state.gameTime * TIME_TO_CENTISECONDS;
}
