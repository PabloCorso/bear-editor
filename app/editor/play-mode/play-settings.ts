export type PlayKeyBindings = {
  throttle: string;
  brake: string;
  turn: string;
  voltLeft: string;
  voltRight: string;
  aloVolt: string;
  rewind: string;
  captureStart: string;
};

export type PlayRunEndBehavior = "restart" | "pause" | "exit";

export type PlayVideoDetail = "high" | "low";

export const MIN_PLAY_FPS_LIMIT = 1;
export const MAX_PLAY_FPS_LIMIT = 999;

export type PlaySettings = {
  runEndBehavior: PlayRunEndBehavior;
  videoDetail: PlayVideoDetail;
  animatedObjects: boolean;
  stillObjects: boolean;
  picturesInBackground: boolean;
  gravityArrows: boolean;
  showFps: boolean;
  limitFps: boolean;
  fpsLimit: number;
  keyBindings: PlayKeyBindings;
};

export const PLAY_MODE_PIXELS_PER_METER = 48;
export const PLAY_MODE_MIN_ZOOM = 0.2;
export const PLAY_MODE_MAX_ZOOM = 5;
export const DEFAULT_PLAY_MODE_ZOOM = 1.6;

export const defaultPlaySettings: PlaySettings = {
  runEndBehavior: "pause",
  videoDetail: "high",
  animatedObjects: true,
  stillObjects: false,
  picturesInBackground: false,
  gravityArrows: true,
  showFps: false,
  limitFps: false,
  fpsLimit: 60,
  keyBindings: {
    throttle: "ArrowUp",
    brake: "ArrowDown",
    turn: "Space",
    voltLeft: "ArrowLeft",
    voltRight: "ArrowRight",
    aloVolt: "KeyA",
    rewind: "KeyR",
    captureStart: "KeyS",
  },
};

/** Preserve existing custom controls when introducing the history shortcuts. */
export function loadPlayKeyBindings(
  saved: Partial<PlayKeyBindings> = {},
): PlayKeyBindings {
  const bindings = { ...defaultPlaySettings.keyBindings, ...saved };
  for (const key of ["rewind", "captureStart"] as const) {
    if (
      saved[key] === undefined &&
      Object.values(saved).includes(bindings[key])
    ) {
      bindings[key] = "";
    }
  }
  return bindings;
}
