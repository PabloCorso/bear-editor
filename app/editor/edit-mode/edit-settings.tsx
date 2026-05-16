import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorEngine } from "~/editor/edit-mode/engine/editor-engine";
import {
  useEditorLevelFolderName,
  useVertexEdgeClickPreference,
  usePlaySettings,
  useEditorStore,
} from "~/editor/use-editor-store";
import {
  useDefaultLevelPreset,
  useSetDefaultLevelPreset,
} from "~/editor/edit-mode/default-level-preset";
import type { VertexEdgeClickBehavior } from "~/editor/editor-preference-types";
import {
  getDefaultLevel,
  type DefaultLevelPreset,
} from "~/editor/helpers/level-parser";
import { supportsFilePickers } from "~/editor/helpers/file-session";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  type DialogProps,
} from "../../components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { cn, useModifier } from "~/utils/misc";
import { useForceUpdate } from "@mantine/hooks";
import {
  defaultPlaySettings,
  type PlayRunEndBehavior,
  type PlayKeyBindings,
} from "~/editor/play-mode/play-settings";
import { Button } from "../../components/ui/button";
import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
} from "@phosphor-icons/react/dist/ssr";
import datGif from "~/assets/dat.gif";

const LEVEL_PRESETS: Array<{
  id: DefaultLevelPreset;
  label: string;
}> = [
  { id: "default", label: "Default" },
  { id: "smibu", label: "Smibu Level Editor" },
  { id: "internal", label: "Internal Editor" },
];

const playRunEndBehaviors: Array<{
  id: PlayRunEndBehavior;
  label: string;
}> = [
  {
    id: "pause",
    label: "Pause",
  },
  {
    id: "restart",
    label: "Restart",
  },
  {
    id: "exit",
    label: "Exit",
  },
];

export function SettingsDialog(props: DialogProps) {
  return (
    <Dialog {...props}>
      <DialogContent
        className="sm:max-w-3xl"
        onKeyDown={(event) => {
          // Prevent global editor shortcuts specially arrow navigation
          event.stopPropagation();
        }}
      >
        <SettingsPanel />
      </DialogContent>
    </Dialog>
  );
}

export function PlaySettingsDialog(props: DialogProps) {
  return (
    <Dialog {...props}>
      <DialogContent
        className="sm:max-w-3xl"
        onKeyDown={(event) => {
          // Prevent global editor shortcuts specially arrow navigation
          event.stopPropagation();
        }}
      >
        <DialogHeader showCloseButton>
          <DialogTitle>Play settings</DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">
          Play mode settings
        </DialogDescription>
        <DialogBody className="pb-6">
          <PlaySettingsPanel />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsPanel() {
  const modifier = useModifier();
  const [activeTab, setActiveTab] = useState("general");
  const vertexEdgeClickBehaviors: Array<{
    id: VertexEdgeClickBehavior;
    label: string;
    description: ReactNode;
  }> = [
    {
      id: "internal",
      label: "Internal Editor",
      description: (
        <>
          Edit polygons by clicking on vertices.
          <br />(
          <code className="rounded-lg bg-primary px-1 font-mono text-xs">
            {modifier}
          </code>{" "}
          +{" "}
          <code className="rounded-lg bg-primary px-1 font-mono text-xs">
            Click
          </code>{" "}
          to edit from edges)
        </>
      ),
    },
    {
      id: "smibu",
      label: "Smibu Level Editor",
      description: "Edit polygons by clicking on vertices or edges.",
    },
  ];

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <>
        <DialogHeader showCloseButton>
          <DialogTitle className="sr-only">Settings</DialogTitle>
          <TabsList>
            <TabsTrigger value="general">Settings</TabsTrigger>
            <TabsTrigger value="play">Play</TabsTrigger>
            <TabsTrigger value="default-level">Preferences</TabsTrigger>
          </TabsList>
        </DialogHeader>
        <DialogDescription className="sr-only">
          Application settings
        </DialogDescription>
        <DialogBody className="pb-6">
          <GeneralSettingsPanel />

          <TabsContent value="play" className="flex flex-col gap-4">
            <PlaySettingsPanel />
          </TabsContent>

          <PreferencesSettingsPanel
            vertexEdgeClickBehaviors={vertexEdgeClickBehaviors}
          />
        </DialogBody>
      </>
    </Tabs>
  );
}

function GeneralSettingsPanel() {
  const store = useEditorStore();
  const levelFolderName = useEditorLevelFolderName();
  const forceUpdate = useForceUpdate();

  return (
    <TabsContent value="general" className="flex flex-col gap-4">
      <p className="flex items-center gap-2">
        <span>Bear Level Editor</span>
        <span className="flex items-center gap-1 text-sm">
          <span>by Pab</span>
          <img src={datGif} alt="dat" className="h-4 w-auto rounded-sm" />
        </span>
      </p>
      <p>
        Feedback is very welcome{" "}
        <a
          href="https://discord.com/channels/207629806513160192/531257164451414018"
          target="_blank"
          rel="noreferrer"
          className="underline focus-visible:focus-ring"
        >
          @levelmaking
        </a>{" "}
        Discord channel! See latest updates{" "}
        <a
          href="https://github.com/PabloCorso/elma-web-editor/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noreferrer"
          className="underline focus-visible:focus-ring"
        >
          here
        </a>
        .
      </p>

      <div className="flex flex-col gap-3 border-t border-separator pt-4">
        <div className="flex flex-col gap-1">
          <p className="font-medium">Level folder</p>
          {supportsFilePickers() ? (
            <p className="text-sm text-primary/70">
              Pick your level folder to save files back in place instead of
              downloading a new copy each time. This works in supported Chrome
              and Edge versions.
            </p>
          ) : (
            <p className="text-sm text-primary/70">
              Direct folder save is not available in this browser, so files will
              be downloaded instead of saved in place. This is currently
              supported in Chrome and Edge.
            </p>
          )}
        </div>

        {supportsFilePickers() ? (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-separator px-4 py-3">
            <div>
              <p className="text-sm text-primary/70">
                {levelFolderName ? (
                  <>
                    Current folder:{" "}
                    <span className="font-semibold">{levelFolderName}</span>
                  </>
                ) : (
                  "No folder selected"
                )}
              </p>
            </div>
            <div className="flex gap-2">
              {levelFolderName && (
                <button
                  className="text-sm text-red-300 underline"
                  onClick={async () => {
                    await store.getState().levelFolder?.forget();
                    forceUpdate();
                  }}
                >
                  Forget
                </button>
              )}
              <button
                className="text-sm text-blue-300 underline"
                onClick={async () => {
                  await store.getState().levelFolder?.pickFolder();
                  forceUpdate();
                }}
              >
                {levelFolderName ? "Change" : "Set"}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-separator px-4 py-3">
            <p className="text-sm text-primary/70">
              Browser support not detected.
            </p>
          </div>
        )}
      </div>
    </TabsContent>
  );
}

function PreferencesSettingsPanel({
  vertexEdgeClickBehaviors,
}: {
  vertexEdgeClickBehaviors: Array<{
    id: VertexEdgeClickBehavior;
    label: string;
    description: ReactNode;
  }>;
}) {
  const store = useEditorStore();
  const defaultLevelPreset = useDefaultLevelPreset();
  const setDefaultLevelPreset = useSetDefaultLevelPreset();
  const vertexEdgeClickBehavior = useVertexEdgeClickPreference();
  const { setVertexEdgeClickBehavior: setEditorVertexEdgeClickBehavior } =
    store.getState().actions;

  return (
    <TabsContent value="default-level" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="font-medium">Starter template</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {LEVEL_PRESETS.map((preset) => {
          const isSelected = defaultLevelPreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => setDefaultLevelPreset(preset.id)}
              className={cn(
                "group relative cursor-pointer overflow-hidden rounded-xl border text-left transition-colors focus-visible:focus-ring",
                isSelected
                  ? "border-blue-400 bg-blue-500/10"
                  : "border-separator",
              )}
              aria-pressed={isSelected}
            >
              <LevelPresetPreview preset={preset.id} />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 via-black/10 to-transparent px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-white/85">
                    {preset.label}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1 pt-2">
        <p className="font-medium">Vertex tool behavior</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {vertexEdgeClickBehaviors.map((behavior) => {
          const isSelected = vertexEdgeClickBehavior === behavior.id;
          return (
            <button
              key={behavior.id}
              type="button"
              onClick={() => setEditorVertexEdgeClickBehavior(behavior.id)}
              className={cn(
                "flex h-full flex-col justify-start rounded-xl border p-4 text-left transition-colors focus-visible:focus-ring",
                isSelected
                  ? "border-blue-400 bg-blue-500/10"
                  : "border-separator",
              )}
              aria-pressed={isSelected}
            >
              <p className="text-sm font-medium">{behavior.label}</p>
              <p className="mt-1 text-sm text-primary/70">
                {behavior.description}
              </p>
            </button>
          );
        })}
      </div>
    </TabsContent>
  );
}

export function PlaySettingsPanel() {
  const store = useEditorStore();
  const playSettings = usePlaySettings();
  const { setPlaySettings } = store.getState().actions;
  const setPlayKeyBinding = (
    binding: keyof PlayKeyBindings,
    nextValue: string,
  ) => {
    const nextKeyBindings: Partial<PlayKeyBindings> = {
      [binding]: nextValue,
    };

    for (const [key, value] of Object.entries(playSettings.keyBindings)) {
      if (key !== binding && value === nextValue) {
        nextKeyBindings[key as keyof PlayKeyBindings] = "";
      }
    }

    setPlaySettings({ keyBindings: nextKeyBindings });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-y-2 sm:grid-cols-2 sm:gap-x-32">
        <label className="flex items-center justify-between">
          <span className="min-w-24 text-sm">When run ends</span>
          <span className="relative">
            <select
              value={playSettings.runEndBehavior}
              onChange={(event) =>
                setPlaySettings({
                  runEndBehavior: event.currentTarget
                    .value as PlayRunEndBehavior,
                })
              }
              className="w-32 appearance-none rounded-md border border-separator bg-transparent py-2 pr-8 pl-3 text-sm"
            >
              {playRunEndBehaviors.map((behavior) => (
                <option key={behavior.id} value={behavior.id}>
                  {behavior.label}
                </option>
              ))}
            </select>
            <CaretDownIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-primary/70"
            />
          </span>
        </label>
        <Button
          type="button"
          onClick={() => setPlaySettings(defaultPlaySettings)}
          className="ml-auto"
          size="sm"
          iconBefore={<ArrowCounterClockwiseIcon />}
        >
          Reset settings
        </Button>
      </div>
      <div className="flex flex-col gap-2 pt-2">
        <p className="font-medium">Controls</p>
        <div className="grid gap-y-2 sm:grid-cols-2 sm:gap-x-32">
          <PlayKeyField
            label="Throttle"
            value={playSettings.keyBindings.throttle}
            onChange={(value) => setPlayKeyBinding("throttle", value)}
          />
          <PlayKeyField
            label="Brake"
            value={playSettings.keyBindings.brake}
            onChange={(value) => setPlayKeyBinding("brake", value)}
          />
          <PlayKeyField
            label="Rotate left"
            value={playSettings.keyBindings.voltLeft}
            onChange={(value) => setPlayKeyBinding("voltLeft", value)}
          />
          <PlayKeyField
            label="Rotate right"
            value={playSettings.keyBindings.voltRight}
            onChange={(value) => setPlayKeyBinding("voltRight", value)}
          />
          <PlayKeyField
            label="Turn"
            value={playSettings.keyBindings.turn}
            onChange={(value) => setPlayKeyBinding("turn", value)}
          />
          <PlayKeyField
            label="Alo volt"
            value={playSettings.keyBindings.aloVolt}
            onChange={(value) => setPlayKeyBinding("aloVolt", value)}
          />
        </div>
      </div>
    </div>
  );
}

function PlayKeyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [isCapturing, setIsCapturing] = useState(false);

  return (
    <label className="flex items-center justify-between">
      <span className="min-w-24 text-sm">{label}</span>
      <input
        type="text"
        readOnly
        value={isCapturing ? "Press a key..." : formatPlayKeyCode(value)}
        onFocus={() => setIsCapturing(true)}
        onBlur={() => setIsCapturing(false)}
        onClick={() => setIsCapturing(true)}
        onKeyDown={(event) => {
          event.preventDefault();
          event.stopPropagation();

          if (event.code === "Escape") {
            setIsCapturing(false);
            return;
          }

          onChange(event.code);
          setIsCapturing(false);
          event.currentTarget.blur();
        }}
        className={cn(
          "w-32 rounded-md border border-separator bg-transparent px-3 py-2 text-sm",
          isCapturing && "border-blue-400 bg-blue-500/10",
        )}
      />
    </label>
  );
}

function formatPlayKeyCode(code: string) {
  if (code.startsWith("Key")) return code.slice(3);
  return code;
}

function LevelPresetPreview({ preset }: { preset: DefaultLevelPreset }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<EditorEngine | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const initializeFrameRef = useRef<number | null>(null);
  const lastSizeRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  useEffect(
    function initializeLevelPresetPreview() {
      const canvas = canvasRef.current;
      const wrapper = wrapperRef.current;
      if (!canvas || !wrapper) return;

      const applyResize = () => {
        const rect = wrapper.getBoundingClientRect();
        const width = Math.floor(rect.width);
        const height = Math.floor(rect.height);
        if (
          width <= 0 ||
          height <= 0 ||
          (lastSizeRef.current.width === width &&
            lastSizeRef.current.height === height)
        ) {
          return;
        }

        canvas.width = width;
        canvas.height = height;
        lastSizeRef.current = { width, height };
        engineRef.current?.fitToView();
      };

      const scheduleResize = () => {
        if (resizeFrameRef.current !== null) return;
        resizeFrameRef.current = requestAnimationFrame(() => {
          resizeFrameRef.current = null;
          applyResize();
        });
      };

      applyResize();

      const resizeObserver = new ResizeObserver(() => {
        scheduleResize();
      });
      resizeObserver.observe(wrapper);

      // Defer heavy preview initialization until after the tab switch has painted.
      initializeFrameRef.current = requestAnimationFrame(() => {
        initializeFrameRef.current = null;
        engineRef.current = new EditorEngine(canvas, {
          readOnly: true,
          initialDocument: {
            level: getDefaultLevel(preset),
            origin: { kind: "default", label: "Preview", canOverwrite: false },
            displayName: "Preview",
            hasExternalHandle: false,
          },
        });
      });

      return () => {
        if (initializeFrameRef.current !== null) {
          cancelAnimationFrame(initializeFrameRef.current);
          initializeFrameRef.current = null;
        }
        if (resizeFrameRef.current !== null) {
          cancelAnimationFrame(resizeFrameRef.current);
          resizeFrameRef.current = null;
        }
        resizeObserver.disconnect();
        engineRef.current?.destroy();
        engineRef.current = null;
        lastSizeRef.current = { width: 0, height: 0 };
      };
    },
    [preset],
  );

  return (
    <div
      ref={wrapperRef}
      className="relative aspect-[16/10] min-h-[120px] w-full bg-[#0f1720]"
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 block h-full w-full"
        aria-hidden="true"
      />
    </div>
  );
}
