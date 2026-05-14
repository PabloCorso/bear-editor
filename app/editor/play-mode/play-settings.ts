export type PlayKeyBindings = {
  throttle: string;
  brake: string;
  turn: string;
  voltLeft: string;
  voltRight: string;
  aloVolt: string;
};

export type PlayRunEndBehavior = "restart" | "pause" | "exit";

export type PlaySettings = {
  runEndBehavior: PlayRunEndBehavior;
  keyBindings: PlayKeyBindings;
};

export const PLAY_MODE_PIXELS_PER_METER = 48;
export const PLAY_MODE_MIN_ZOOM = 0.2;
export const PLAY_MODE_MAX_ZOOM = 5;
export const DEFAULT_PLAY_MODE_ZOOM = 1.6;

export const defaultPlaySettings: PlaySettings = {
  runEndBehavior: "pause",
  keyBindings: {
    throttle: "ArrowUp",
    brake: "ArrowDown",
    turn: "Space",
    voltLeft: "ArrowLeft",
    voltRight: "ArrowRight",
    aloVolt: "KeyA",
  },
};
