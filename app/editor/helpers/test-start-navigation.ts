import type { EditorStore } from "~/editor/editor-store";
import type { Position } from "~/editor/elma-types";
import { getDevicePixelSnappedViewportCenter } from "~/editor/helpers/camera-helpers";
import { createStartCamera } from "~/editor/play-mode/engine/game/camera";
import {
  DEFAULT_PLAY_MODE_ZOOM,
  PLAY_MODE_MAX_ZOOM,
  PLAY_MODE_MIN_ZOOM,
  PLAY_MODE_PIXELS_PER_METER,
} from "~/editor/play-mode/play-settings";

export function goToTestStart(
  store: EditorStore,
  position: Position,
  canvas = document.querySelector("canvas"),
) {
  const state = store.getState();
  const rect = canvas?.getBoundingClientRect();
  if (!rect) return;
  const zoom =
    PLAY_MODE_PIXELS_PER_METER *
    Math.max(
      PLAY_MODE_MIN_ZOOM,
      Math.min(
        PLAY_MODE_MAX_ZOOM,
        state.playModeZoom || DEFAULT_PLAY_MODE_ZOOM,
      ),
    );
  const camera = createStartCamera({ x: position.x, y: -position.y });
  const center = getDevicePixelSnappedViewportCenter({
    centerX: camera.x,
    centerY: -camera.y,
    width: rect.width,
    height: rect.height,
    zoom,
    devicePixelRatio: window.devicePixelRatio || 1,
  });
  store.setState({
    zoom,
    viewPortOffset: {
      x: rect.width / 2 - center.x * zoom,
      y: rect.height / 2 - center.y * zoom,
    },
  });
}
