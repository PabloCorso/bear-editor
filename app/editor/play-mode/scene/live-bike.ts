import { FRAME_INDEX_TO_TIME } from "~/editor/play-mode/engine/core/constants";
import type { GameState } from "~/editor/play-mode/engine/game/game-loop";
import type { RideMoment } from "~/editor/play-mode/engine/game/ride-history";
import { DEFAULT_OBJECT_RENDER_DISTANCE } from "~/editor/render/render-constants";
import type { WorldRenderBikeItem } from "~/editor/render/world-scene";

const VOLT_ARM_ANIMATION_FRAMES = 28;
const VOLT_ARM_ANIMATION_DURATION =
  VOLT_ARM_ANIMATION_FRAMES * FRAME_INDEX_TO_TIME;
const TURN_ANIMATION_WALL_SECONDS = 0.55;
const TURN_ANIMATION_DURATION =
  TURN_ANIMATION_WALL_SECONDS * 30 * FRAME_INDEX_TO_TIME;

type BikeSceneState = Pick<
  GameState,
  "motor" | "gameTime" | "lastVoltDirection" | "lastVoltTime" | "lastTurnTime"
>;

export function buildRideMomentBikeSceneItem(
  moment: RideMoment,
): WorldRenderBikeItem {
  return { ...buildBikeSceneItem(moment.snapshot), forceVisible: false };
}

export function buildBikeSceneItem(state: BikeSceneState): WorldRenderBikeItem {
  const motor = state.motor;
  const rawVoltProgress =
    state.lastVoltDirection == null
      ? 0
      : (state.gameTime - state.lastVoltTime) / VOLT_ARM_ANIMATION_DURATION;
  const voltProgress = Math.max(0, Math.min(rawVoltProgress, 1));
  const rawTurnProgress =
    state.lastTurnTime <= -100
      ? 1
      : (state.gameTime - state.lastTurnTime) / TURN_ANIMATION_DURATION;
  const turnProgress = Math.max(0, Math.min(rawTurnProgress, 1));

  return {
    fallback: {
      bike: {
        x: motor.bike.r.x,
        y: -motor.bike.r.y,
      },
      leftWheel: {
        x: motor.leftWheel.r.x,
        y: -motor.leftWheel.r.y,
      },
      rightWheel: {
        x: motor.rightWheel.r.x,
        y: -motor.rightWheel.r.y,
      },
      head: {
        x: motor.headR.x,
        y: -motor.headR.y,
      },
      flipped: motor.flippedBike,
      rotation: motor.bike.rotation,
    },
    type: "bike",
    forceVisible: true,
    distance: DEFAULT_OBJECT_RENDER_DISTANCE,
    start: {
      x: motor.leftWheel.r.x,
      y: -motor.leftWheel.r.y,
    },
    coords: {
      bikeR: (motor.bike.rotation * 10000) / (Math.PI * 2),
      turn: motor.flippedBike ? 1 : 0,
      leftX: (motor.leftWheel.r.x - motor.bike.r.x) * 1000,
      leftY: (motor.leftWheel.r.y - motor.bike.r.y) * 1000,
      leftR: (motor.leftWheel.rotation * 250) / (Math.PI * 2),
      rightX: (motor.rightWheel.r.x - motor.bike.r.x) * 1000,
      rightY: (motor.rightWheel.r.y - motor.bike.r.y) * 1000,
      rightR: (motor.rightWheel.rotation * 250) / (Math.PI * 2),
      // The original replay renderer's head coords are the rider anchor
      // near the torso/neck, not the physics head collision center.
      headX: (motor.bodyR.x - motor.bike.r.x) * 1000,
      headY: (motor.bodyR.y - motor.bike.r.y) * 1000,
      turnProgress,
      voltDirection: voltProgress > 0 ? state.lastVoltDirection : null,
      voltProgress,
    },
  };
}
