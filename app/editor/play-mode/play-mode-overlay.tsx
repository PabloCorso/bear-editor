import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalStorage } from "@mantine/hooks";
import {
  ArrowsClockwiseIcon,
  ArrowDownIcon,
  ArrowBendUpLeftIcon,
  ArrowBendUpRightIcon,
  ArrowUpIcon,
  GearIcon,
  GameControllerIcon,
  ArrowsLeftRightIcon,
  MinusIcon,
  PlusIcon,
  StopIcon,
  ArrowBendDoubleUpRightIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  Toolbar,
  ToolbarSeparator,
  type ToolbarProps,
} from "~/components/ui/toolbar";
import { useLgrAssets } from "~/components/use-lgr-assets";
import { checkModifierKey, cn } from "~/utils/misc";
import { PlaySettingsDialog } from "~/editor/edit-mode/edit-settings";
import { Button } from "~/components/ui/button";
import {
  useEditorActions,
  useEditorStore,
  usePlaySettings,
} from "~/editor/use-editor-store";
import {
  DEFAULT_PLAY_MODE_ZOOM,
  PLAY_MODE_MAX_ZOOM,
  PLAY_MODE_MIN_ZOOM,
  type PlayRunEndBehavior,
} from "~/editor/play-mode/play-settings";
import { elmaLevelFromEditorState } from "~/editor/helpers/level-parser";
import { convertLevelToGameData } from "~/editor/play-mode/level-converter";
import {
  createGame,
  formatTime,
  gameFrame,
  getTimeCentiseconds,
  type GameState,
} from "~/editor/play-mode/engine/game/game-loop";
import type { LevelData } from "~/editor/play-mode/engine/level";
import {
  DEFAULT_KEYS,
  InputManager,
} from "~/editor/play-mode/engine/input-manager";
import { createPlayModeRenderer } from "~/editor/play-mode/scene/renderer";
import type { WorldSceneRendererBackend } from "~/editor/render/world-scene-renderer";
import { ToolButton } from "~/components/tool-button";

const PLAY_MODE_WHEEL_ZOOM_STEP = 420;
const PLAY_MODE_TOUCHPAD_ZOOM_STEP = 100;
const PLAY_MODE_BUTTON_ZOOM_FACTOR = 1.2;
const PLAY_MODE_DOUBLE_TAP_MAX_DELAY_MS = 300;
const PLAY_MODE_DOUBLE_TAP_MAX_DISTANCE_PX = 32;
const PLAY_MODE_DOUBLE_TAP_TIP_DISMISSED_STORAGE_KEY =
  "elma-web-play-mode-double-tap-tip-dismissed";
const PLAY_MODE_MOBILE_CONTROL_IDS = [
  "gas",
  "brake",
  "turn",
  "leftVolt",
  "rightVolt",
  "alovolt",
] as const;

type PlayModeMobileControlId = (typeof PLAY_MODE_MOBILE_CONTROL_IDS)[number];
type PlayModeMobileControlState = Record<PlayModeMobileControlId, boolean>;

const INITIAL_PLAY_MODE_MOBILE_CONTROL_STATE: PlayModeMobileControlState = {
  gas: false,
  brake: false,
  turn: false,
  leftVolt: false,
  rightVolt: false,
  alovolt: false,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getPlayKeyBindings(playSettings: ReturnType<typeof usePlaySettings>) {
  return {
    ...DEFAULT_KEYS,
    gas: playSettings.keyBindings.throttle,
    brake: playSettings.keyBindings.brake,
    turn: playSettings.keyBindings.turn,
    leftVolt: playSettings.keyBindings.voltLeft,
    rightVolt: playSettings.keyBindings.voltRight,
    alovolt: playSettings.keyBindings.aloVolt,
    escape: "Escape",
  };
}

function getPlayInputKeys(playSettings: ReturnType<typeof usePlaySettings>) {
  return ["Enter", ...Object.values(playSettings.keyBindings).filter(Boolean)];
}

function getActiveMobileControlState(
  input: InputManager,
  keyBindings: ReturnType<typeof getPlayKeyBindings>,
): PlayModeMobileControlState {
  return {
    gas: input.isDown(keyBindings.gas),
    brake: input.isDown(keyBindings.brake),
    turn: input.isDown(keyBindings.turn),
    leftVolt: input.isDown(keyBindings.leftVolt),
    rightVolt: input.isDown(keyBindings.rightVolt),
    alovolt: input.isDown(keyBindings.alovolt),
  };
}

export function PlayModeOverlay({
  rendererBackend = "webgl",
}: {
  rendererBackend?: WorldSceneRendererBackend;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeMobilePointersRef = useRef<Map<number, PlayModeMobileControlId>>(
    new Map(),
  );
  const lastCanvasTapRef = useRef<{
    timestamp: number;
    x: number;
    y: number;
  } | null>(null);
  const store = useEditorStore();
  const { lgr } = useLgrAssets();
  const playSettings = usePlaySettings();
  const gameStateRef = useRef<GameState | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const keyBindingsRef = useRef(getPlayKeyBindings(playSettings));
  const runEndBehaviorRef = useRef<PlayRunEndBehavior>(
    playSettings.runEndBehavior,
  );
  const restartRequestedRef = useRef(false);
  const playTimeTextRef = useRef<HTMLDivElement>(null);
  const lastPlayTimeRef = useRef("00:00,00");
  const { setPlayModeZoom, stopPlayMode } = useEditorActions();
  const [playSettingsOpen, setPlaySettingsOpen] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(pointer: coarse)").matches;
  });
  const [isDoubleTapTipDismissed, setIsDoubleTapTipDismissed] =
    useLocalStorage<boolean>({
      key: PLAY_MODE_DOUBLE_TAP_TIP_DISMISSED_STORAGE_KEY,
      defaultValue: false,
      getInitialValueInEffect: false,
    });
  const [activeMobileControls, setActiveMobileControls] =
    useState<PlayModeMobileControlState>(
      INITIAL_PLAY_MODE_MOBILE_CONTROL_STATE,
    );

  const syncStoredZoom = useCallback(
    (nextZoom: number) => {
      setPlayModeZoom(clamp(nextZoom, PLAY_MODE_MIN_ZOOM, PLAY_MODE_MAX_ZOOM));
    },
    [setPlayModeZoom],
  );

  const updateCameraZoom = useCallback(
    (updateZoom: (currentZoom: number) => number) => {
      const gameState = gameStateRef.current;
      if (!gameState) return;

      gameState.camera.zoom = clamp(
        updateZoom(gameState.camera.zoom),
        PLAY_MODE_MIN_ZOOM,
        PLAY_MODE_MAX_ZOOM,
      );
      syncStoredZoom(gameState.camera.zoom);
    },
    [syncStoredZoom],
  );

  const zoomIn = useCallback(() => {
    updateCameraZoom(
      (currentZoom) => currentZoom * PLAY_MODE_BUTTON_ZOOM_FACTOR,
    );
  }, [updateCameraZoom]);

  const zoomOut = useCallback(() => {
    updateCameraZoom(
      (currentZoom) => currentZoom / PLAY_MODE_BUTTON_ZOOM_FACTOR,
    );
  }, [updateCameraZoom]);

  const releaseMobileControls = useCallback(() => {
    activeMobilePointersRef.current.clear();
    inputRef.current?.releaseKeys(
      PLAY_MODE_MOBILE_CONTROL_IDS.map(
        (controlId) => keyBindingsRef.current[controlId],
      ),
    );
    setActiveMobileControls(INITIAL_PLAY_MODE_MOBILE_CONTROL_STATE);
  }, []);

  const setMobileControlPressed = useCallback(
    (controlId: PlayModeMobileControlId, isPressed: boolean) => {
      const input = inputRef.current;
      if (!input) return;

      const keyCode = keyBindingsRef.current[controlId];
      if (isPressed) {
        input.pressKey(keyCode);
      } else {
        input.releaseKey(keyCode);
      }

      setActiveMobileControls((currentState) => {
        if (currentState[controlId] === isPressed) return currentState;
        return { ...currentState, [controlId]: isPressed };
      });
    },
    [],
  );

  const handleMobileControlPointerChange = useCallback(
    (
      controlId: PlayModeMobileControlId,
      pointerId: number,
      isPressed: boolean,
    ) => {
      const activeMobilePointers = activeMobilePointersRef.current;

      if (isPressed) {
        for (const [activePointerId, activeControlId] of activeMobilePointers) {
          if (activeControlId === controlId && activePointerId !== pointerId) {
            activeMobilePointers.delete(activePointerId);
          }
        }

        activeMobilePointers.set(pointerId, controlId);
        setMobileControlPressed(controlId, true);
        return;
      }

      const activeControlId = activeMobilePointers.get(pointerId);
      if (!activeControlId) return;

      activeMobilePointers.delete(pointerId);
      setMobileControlPressed(activeControlId, false);
    },
    [setMobileControlPressed],
  );

  const releaseMobileControlPointer = useCallback(
    (pointerId: number) => {
      const activeControlId = activeMobilePointersRef.current.get(pointerId);
      if (!activeControlId) return;

      activeMobilePointersRef.current.delete(pointerId);
      setMobileControlPressed(activeControlId, false);
    },
    [setMobileControlPressed],
  );

  const toggleMobileControls = useCallback(() => {
    setMobileControlsOpen((isOpen) => {
      if (isOpen) {
        releaseMobileControls();
      }
      return !isOpen;
    });
  }, [releaseMobileControls]);

  const restartPlayMode = useCallback(() => {
    restartRequestedRef.current = true;
  }, []);

  const handlePlaySettingsOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        releaseMobileControls();
      }
      setPlaySettingsOpen(nextOpen);
    },
    [releaseMobileControls],
  );

  const handleCanvasPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (
        event.pointerType === "mouse" &&
        (!event.isPrimary || event.button !== 0)
      ) {
        return;
      }

      const now = performance.now();
      const lastTap = lastCanvasTapRef.current;
      const isDoubleTap =
        lastTap !== null &&
        now - lastTap.timestamp <= PLAY_MODE_DOUBLE_TAP_MAX_DELAY_MS &&
        Math.hypot(lastTap.x - event.clientX, lastTap.y - event.clientY) <=
          PLAY_MODE_DOUBLE_TAP_MAX_DISTANCE_PX;

      lastCanvasTapRef.current = {
        timestamp: now,
        x: event.clientX,
        y: event.clientY,
      };

      if (isDoubleTap) {
        restartPlayMode();
        lastCanvasTapRef.current = null;
      }
    },
    [restartPlayMode],
  );

  useEffect(
    function syncMobileControlLifecycle() {
      if (typeof window === "undefined") return;

      const handleWindowPointerUp = (event: PointerEvent) => {
        releaseMobileControlPointer(event.pointerId);
      };

      const handleWindowPointerCancel = (event: PointerEvent) => {
        releaseMobileControlPointer(event.pointerId);
      };

      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") return;
        releaseMobileControls();
      };

      const handleFocusLoss = () => {
        releaseMobileControls();
      };

      window.addEventListener("pointerup", handleWindowPointerUp);
      window.addEventListener("pointercancel", handleWindowPointerCancel);
      window.addEventListener("blur", handleFocusLoss);
      window.addEventListener("pagehide", handleFocusLoss);
      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        window.removeEventListener("pointerup", handleWindowPointerUp);
        window.removeEventListener("pointercancel", handleWindowPointerCancel);
        window.removeEventListener("blur", handleFocusLoss);
        window.removeEventListener("pagehide", handleFocusLoss);
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
      };
    },
    [releaseMobileControlPointer, releaseMobileControls],
  );

  useEffect(
    function syncPlaySettings() {
      const nextKeyBindings = getPlayKeyBindings(playSettings);
      keyBindingsRef.current = nextKeyBindings;
      runEndBehaviorRef.current = playSettings.runEndBehavior;
      if (gameStateRef.current) {
        gameStateRef.current.keys = nextKeyBindings;
      }
      inputRef.current?.setExtraGameKeys(getPlayInputKeys(playSettings));
    },
    [playSettings],
  );

  useEffect(
    function setupPlayModeOverlay() {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      let levelData: LevelData;
      try {
        levelData = convertLevelToGameData(
          elmaLevelFromEditorState(store.getState()),
        );
      } catch (error) {
        console.error("Failed to start play mode:", error);
        stopPlayMode();
        return;
      }

      const input = new InputManager(
        getPlayInputKeys(store.getState().playSettings),
        store.getState().playModeSeedKeys,
      );
      inputRef.current = input;
      const renderer = createPlayModeRenderer({
        canvas,
        lgrAssets: lgr,
        backend: rendererBackend,
      });
      const keyBindings = keyBindingsRef.current;

      let gameState: GameState = createGame(levelData, input, keyBindings);
      gameStateRef.current = gameState;
      gameState.lastTimestamp = performance.now();
      gameState.camera.zoom = clamp(
        store.getState().playModeZoom || DEFAULT_PLAY_MODE_ZOOM,
        PLAY_MODE_MIN_ZOOM,
        PLAY_MODE_MAX_ZOOM,
      );
      syncStoredZoom(gameState.camera.zoom);
      updatePlayTimeText(formatTime(getTimeCentiseconds(gameState)));

      const resize = () => {
        renderer.resize();
      };

      const observer = new ResizeObserver(() => resize());
      observer.observe(container);
      resize();

      const handleWheel = (event: WheelEvent) => {
        const modifier = checkModifierKey(event);
        const isLikelyPinchWheel =
          event.ctrlKey && event.deltaMode === WheelEvent.DOM_DELTA_PIXEL;
        if (!modifier && !isLikelyPinchWheel) return;

        event.preventDefault();
        const zoomStepValue = isLikelyPinchWheel
          ? PLAY_MODE_TOUCHPAD_ZOOM_STEP
          : PLAY_MODE_WHEEL_ZOOM_STEP;
        const zoomFactor = Math.pow(2, -event.deltaY / zoomStepValue);
        gameState.camera.zoom = clamp(
          gameState.camera.zoom * zoomFactor,
          PLAY_MODE_MIN_ZOOM,
          PLAY_MODE_MAX_ZOOM,
        );
        syncStoredZoom(gameState.camera.zoom);
      };

      canvas.addEventListener("wheel", handleWheel, { passive: false });

      const resetGame = () => {
        gameState = createGame(levelData, input, keyBindingsRef.current);
        gameStateRef.current = gameState;
        input.seedJustPressedKey(keyBindingsRef.current.turn);
        gameState.lastTimestamp = performance.now();
        gameState.camera.zoom = clamp(
          store.getState().playModeZoom || DEFAULT_PLAY_MODE_ZOOM,
          PLAY_MODE_MIN_ZOOM,
          PLAY_MODE_MAX_ZOOM,
        );
        restartRequestedRef.current = false;
        syncStoredZoom(gameState.camera.zoom);
        updatePlayTimeText(formatTime(getTimeCentiseconds(gameState)));
      };

      const handleRunEnd = () => {
        switch (runEndBehaviorRef.current) {
          case "restart":
            resetGame();
            return false;
          case "exit":
            stopPlayMode();
            return true;
          case "pause":
          default:
            return false;
        }
      };

      let animationFrame = 0;
      const loop = (timestamp: number) => {
        if (restartRequestedRef.current || input.wasJustPressed("Enter")) {
          resetGame();
        }

        gameFrame(gameState, timestamp);
        if (
          (gameState.result === "dead" || gameState.result === "won") &&
          handleRunEnd()
        ) {
          return;
        }
        syncStoredZoom(gameState.camera.zoom);
        setActiveMobileControls((currentState) => {
          const nextState = getActiveMobileControlState(
            input,
            keyBindingsRef.current,
          );
          for (const controlId of PLAY_MODE_MOBILE_CONTROL_IDS) {
            if (currentState[controlId] !== nextState[controlId]) {
              return nextState;
            }
          }
          return currentState;
        });
        updatePlayTimeText(formatTime(getTimeCentiseconds(gameState)));
        renderer.render(gameState, {
          visibility: store.getState().levelVisibility,
        });

        if (gameState.result === "escaped") {
          stopPlayMode();
          return;
        }

        input.update();
        animationFrame = requestAnimationFrame(loop);
      };

      animationFrame = requestAnimationFrame(loop);

      return () => {
        cancelAnimationFrame(animationFrame);
        canvas.removeEventListener("wheel", handleWheel);
        observer.disconnect();
        releaseMobileControls();
        lastCanvasTapRef.current = null;
        restartRequestedRef.current = false;
        gameStateRef.current = null;
        inputRef.current = null;
        input.destroy();
      };
    },
    [
      lgr,
      releaseMobileControls,
      rendererBackend,
      setPlayModeZoom,
      store,
      stopPlayMode,
      syncStoredZoom,
    ],
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-20 bg-black/60 backdrop-blur-[1px] select-none"
    >
      <div className="pointer-events-none absolute top-4 right-4 z-10 flex items-center gap-4">
        <div
          ref={playTimeTextRef}
          className="text-right font-mono text-2xl font-bold text-primary tabular-nums"
        >
          {lastPlayTimeRef.current}
        </div>
        <Toolbar className="pointer-events-auto gap-2">
          <ToolButton
            name="Play settings"
            onClick={() => handlePlaySettingsOpenChange(true)}
          >
            <GearIcon weight="fill" />
          </ToolButton>
          <ToolbarSeparator />
          <ToolButton name="Restart run" onClick={restartPlayMode}>
            <ArrowsClockwiseIcon weight="fill" />
          </ToolButton>
          <ToolButton
            name="Stop play mode"
            shortcut="Escape"
            onClick={stopPlayMode}
          >
            <StopIcon weight="fill" />
          </ToolButton>
        </Toolbar>
      </div>
      <div className="pointer-events-none absolute right-4 bottom-4 z-10 flex items-center gap-2">
        <PlayModeToolbarGroup className="pointer-events-auto">
          <PlayModeToolbarButton
            name="Zoom In"
            shortcut="+ / ="
            onClick={zoomIn}
          >
            <PlusIcon />
          </PlayModeToolbarButton>
          <PlayModeToolbarButton name="Zoom Out" shortcut="-" onClick={zoomOut}>
            <MinusIcon />
          </PlayModeToolbarButton>
        </PlayModeToolbarGroup>
        <PlayModeToolbarGroup className="pointer-events-auto">
          <PlayModeToolbarButton
            name={
              mobileControlsOpen
                ? "Hide mobile controls"
                : "Show mobile controls"
            }
            onClick={toggleMobileControls}
          >
            <GameControllerIcon />
          </PlayModeToolbarButton>
        </PlayModeToolbarGroup>
      </div>
      {mobileControlsOpen && !isDoubleTapTipDismissed ? (
        <div className="pointer-events-none absolute bottom-4 left-4 z-10">
          <PlayModeDoubleTapTip
            onDismiss={() => setIsDoubleTapTipDismissed(true)}
          />
        </div>
      ) : null}
      {mobileControlsOpen ? (
        <PlayModeMobileControls
          activeControls={activeMobileControls}
          onControlPointerChange={handleMobileControlPointerChange}
        />
      ) : null}
      <canvas
        ref={canvasRef}
        className="block h-full w-full outline-none"
        onPointerDown={handleCanvasPointerDown}
      />
      <PlaySettingsDialog
        open={playSettingsOpen}
        onOpenChange={handlePlaySettingsOpenChange}
      />
    </div>
  );

  function updatePlayTimeText(nextPlayTime: string) {
    if (lastPlayTimeRef.current === nextPlayTime) return;
    lastPlayTimeRef.current = nextPlayTime;
    const element = playTimeTextRef.current;
    if (element) {
      element.textContent = nextPlayTime;
    }
  }
}

function PlayModeToolbarGroup({ className, ...props }: ToolbarProps) {
  return (
    <Toolbar className={cn("gap-0 rounded-full p-0", className)} {...props} />
  );
}

function PlayModeToolbarButton({
  className,
  ...props
}: React.ComponentProps<typeof ToolButton>) {
  return (
    <ToolButton
      className={cn(
        "peer rounded-none peer-[button]:border-l peer-[button]:border-separator/40",
        "first-of-type:rounded-l-full last-of-type:rounded-r-full only-of-type:rounded-full",
        "first-of-type:*:translate-x-px last-of-type:*:-translate-x-px only-of-type:*:translate-x-0",
        className,
      )}
      size="sm"
      iconSize="sm"
      {...props}
    />
  );
}

function PlayModeDoubleTapTip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="text-muted pointer-events-auto flex h-8 items-center gap-1.5 rounded-full border border-default bg-screen/80 pr-1.5 pl-2.5 text-[11px] font-medium shadow-sm backdrop-blur-[1px] sm:text-xs">
      <span className="text-primary">Tip:</span>
      <span>Double tap to restart</span>
      <Button
        type="button"
        size="sm"
        iconOnly
        aria-label="Dismiss restart tip"
        title="Dismiss tip"
        className="text-muted h-6 w-6 rounded-full bg-transparent hover:bg-primary-hover/40 active:bg-primary-active/40"
        onClick={onDismiss}
      >
        <XIcon />
      </Button>
    </div>
  );
}

type PlayModeMobileControlsProps = {
  activeControls: PlayModeMobileControlState;
  onControlPointerChange: (
    controlId: PlayModeMobileControlId,
    pointerId: number,
    isPressed: boolean,
  ) => void;
};

function PlayModeMobileControls({
  activeControls,
  onControlPointerChange,
}: PlayModeMobileControlsProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-14 z-10 flex items-end justify-between px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex flex-col items-start gap-2 sm:gap-3">
        <MobileDriveButton
          label="Turn"
          icon={<ArrowsLeftRightIcon weight="bold" />}
          isActive={activeControls.turn}
          onPressedChange={(pointerId, isPressed) =>
            onControlPointerChange("turn", pointerId, isPressed)
          }
        />
        <div className="flex items-end gap-2 sm:gap-3">
          <MobileDriveButton
            label="Rotate left"
            icon={<ArrowBendUpLeftIcon weight="bold" />}
            isActive={activeControls.leftVolt}
            onPressedChange={(pointerId, isPressed) =>
              onControlPointerChange("leftVolt", pointerId, isPressed)
            }
          />
          <MobileDriveButton
            label="Rotate right"
            icon={<ArrowBendUpRightIcon weight="bold" />}
            isActive={activeControls.rightVolt}
            onPressedChange={(pointerId, isPressed) =>
              onControlPointerChange("rightVolt", pointerId, isPressed)
            }
          />
          <div className="-translate-y-9 self-start sm:-translate-y-11">
            <MobileDriveButton
              label="Alo volt"
              icon={<ArrowBendDoubleUpRightIcon weight="bold" />}
              isActive={activeControls.alovolt}
              onPressedChange={(pointerId, isPressed) =>
                onControlPointerChange("alovolt", pointerId, isPressed)
              }
            />
          </div>
        </div>
      </div>
      <div className="pointer-events-auto flex items-end gap-2 sm:gap-3">
        <div className="flex flex-col gap-2 sm:gap-3">
          <MobileDriveButton
            label="Throttle"
            icon={<ArrowUpIcon weight="bold" />}
            isActive={activeControls.gas}
            onPressedChange={(pointerId, isPressed) =>
              onControlPointerChange("gas", pointerId, isPressed)
            }
          />
          <MobileDriveButton
            label="Brake"
            icon={<ArrowDownIcon weight="bold" />}
            isActive={activeControls.brake}
            onPressedChange={(pointerId, isPressed) =>
              onControlPointerChange("brake", pointerId, isPressed)
            }
          />
        </div>
      </div>
    </div>
  );
}

type MobileDriveButtonProps = {
  className?: string;
  icon: React.ReactNode;
  isActive: boolean;
  label: string;
  onPressedChange: (pointerId: number, isPressed: boolean) => void;
};

function MobileDriveButton({
  className,
  icon,
  isActive,
  label,
  onPressedChange,
}: MobileDriveButtonProps) {
  return (
    <Button
      type="button"
      iconOnly
      iconSize="lg"
      aria-label={label}
      title={label}
      iconBefore={icon}
      className={cn(
        "h-16 w-16",
        "touch-none rounded-full bg-screen/80",
        "select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none]",
        { "bg-primary-active": isActive },
        className,
      )}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        event.preventDefault();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // iOS Safari can reject pointer capture for some touch sequences.
        }
        onPressedChange(event.pointerId, true);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onPressedChange(event.pointerId, false);
      }}
      onPointerCancel={(event) => onPressedChange(event.pointerId, false)}
      onLostPointerCapture={(event) => onPressedChange(event.pointerId, false)}
    />
  );
}
