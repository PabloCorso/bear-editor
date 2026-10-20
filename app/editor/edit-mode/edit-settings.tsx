import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectTriggerIcon,
  SelectValue,
} from "~/components/ui/select";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { EditorEngine } from "~/editor/edit-mode/engine/editor-engine";
import {
  useEditorLevelFolderName,
  useVertexEdgeClickPreference,
  usePlaySettings,
  useEditorStore,
} from "~/editor/use-editor-store";
import { createEditorStore } from "~/editor/editor-store";
import {
  useCustomDefaultLevelTemplate,
  useDefaultLevelPreset,
  useSetDefaultLevelPreset,
  useSetCustomDefaultLevelTemplate,
} from "~/editor/edit-mode/default-level-preset";
import type { VertexEdgeClickBehavior } from "~/editor/editor-preference-types";
import {
  editorLevelFromFile,
  getDefaultLevel,
  type DefaultLevelPreset,
} from "~/editor/helpers/level-parser";
import type { EditorLevel } from "~/editor/elma-types";
import { defaultLevelVisibility } from "~/editor/level-visibility";
import { defaultAutoGrassOptions } from "~/editor/helpers/auto-grass";
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
  DEFAULT_PLAY_MODE_ZOOM,
  defaultPlaySettings,
  type PlayRunEndBehavior,
  type PlayKeyBindings,
} from "~/editor/play-mode/play-settings";
import { Button } from "../../components/ui/button";
import {
  ArrowCounterClockwiseIcon,
  FolderIcon,
  InfoIcon,
  PlusIcon,
} from "@phosphor-icons/react/dist/ssr";
import datGif from "~/assets/dat.gif";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useLgrAssets } from "~/components/use-lgr-assets";

const LEVEL_PRESETS: Array<{
  id: DefaultLevelPreset;
  label: string;
}> = [{ id: "default", label: "Default" }];

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

export function SettingsDialog({
  highlightLevelFolder = false,
  ...props
}: DialogProps & { highlightLevelFolder?: boolean }) {
  return (
    <Dialog {...props}>
      <DialogContent
        className="sm:max-w-3xl"
        initialFocus={
          highlightLevelFolder
            ? () => document.getElementById("settings-level-folder") ?? true
            : undefined
        }
        onKeyDown={(event) => {
          // Prevent global editor shortcuts specially arrow navigation
          event.stopPropagation();
        }}
      >
        <SettingsPanel
          key={highlightLevelFolder ? "level-folder" : "settings"}
          highlightLevelFolder={highlightLevelFolder}
        />
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
        <DialogHeader showCloseButton className="pb-4">
          <DialogTitle>Play settings</DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">
          Play mode settings
        </DialogDescription>
        <DialogBody className="pt-2 pb-6">
          <PlaySettingsPanel />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsPanel({
  highlightLevelFolder = false,
}: { highlightLevelFolder?: boolean } = {}) {
  const modifier = useModifier();
  const [activeTab, setActiveTab] = useState("general");
  const vertexEdgeClickBehaviors: Array<{
    id: VertexEdgeClickBehavior;
    label: string;
    description: ReactNode;
  }> = [
    {
      id: "default",
      label: "Default",
      description: "Edit polygons by clicking on vertices or edges.",
    },
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
  ];

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0">
      <>
        <DialogHeader showCloseButton className="pb-4 pl-3.5">
          <DialogTitle className="sr-only">Settings</DialogTitle>
          <TabsList className="max-[360px]:gap-0">
            <TabsTrigger value="general" className="max-[360px]:text-xs">
              Settings
            </TabsTrigger>
            <TabsTrigger value="play" className="max-[360px]:text-xs">
              Play
            </TabsTrigger>
            <TabsTrigger value="default-level" className="max-[360px]:text-xs">
              Preferences
            </TabsTrigger>
          </TabsList>
        </DialogHeader>
        <DialogDescription className="sr-only">
          Application settings
        </DialogDescription>
        <DialogBody
          className={cn("pt-2", activeTab === "general" ? "pb-2.5" : "pb-6")}
        >
          <GeneralSettingsPanel highlightLevelFolder={highlightLevelFolder} />

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

function SettingsSectionHeading({
  id,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-1">
        <h2 id={id} className="text-base font-medium">
          {title}
        </h2>
        {children}
      </div>
      <p className="text-sm text-secondary">{description}</p>
    </div>
  );
}

function GeneralSettingsPanel({
  highlightLevelFolder,
}: {
  highlightLevelFolder: boolean;
}) {
  const store = useEditorStore();
  const levelFolderName = useEditorLevelFolderName();
  const forceUpdate = useForceUpdate();
  const canPickFolder =
    supportsFilePickers() && "showDirectoryPicker" in window;

  return (
    <TabsContent value="general" className="flex flex-col gap-6">
      <section
        aria-labelledby="level-folder-heading"
        className="flex flex-col gap-3"
      >
        <SettingsSectionHeading
          id="level-folder-heading"
          title="Level folder"
          description={
            canPickFolder
              ? "Set your Elasto Mania lev folder."
              : "Levels are saved as downloads in this browser."
          }
        >
          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                aria-label="About level folders and browser support"
                className="flex size-6 cursor-pointer items-center justify-center rounded-md text-secondary transition-colors hover:bg-primary hover:text-primary focus-visible:focus-ring"
              >
                <InfoIcon aria-hidden className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-96 text-pretty" side="top">
              Choose a folder to save levels in place. Folder access requires a
              supported Chrome or Edge browser. Other browsers download a copy
              instead.
            </TooltipContent>
          </Tooltip>
          {canPickFolder && levelFolderName && (
            <Tooltip>
              <TooltipTrigger>
                <Button
                  type="button"
                  aria-label="Reset level folder"
                  className="ml-auto h-6 px-2"
                  size="sm"
                  iconBefore={<ArrowCounterClockwiseIcon aria-hidden />}
                  onClick={async () => {
                    await store.getState().levelFolder?.forget();
                    forceUpdate();
                  }}
                >
                  Reset
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Forget folder. Your files stay on your device.
              </TooltipContent>
            </Tooltip>
          )}
        </SettingsSectionHeading>

        {canPickFolder ? (
          <div className="flex items-center gap-2">
            <button
              id="settings-level-folder"
              type="button"
              onClick={async () => {
                await store.getState().levelFolder?.pickFolder();
                forceUpdate();
              }}
              aria-label={
                levelFolderName
                  ? `Change level folder: ${levelFolderName}`
                  : "Choose level folder"
              }
              className={cn(
                "group relative flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-separator bg-primary/30 p-4 text-left transition-colors hover:border-accent/60 hover:bg-primary/70 focus-visible:focus-ring",
                highlightLevelFolder &&
                  !levelFolderName &&
                  "after:pointer-events-none after:absolute after:-inset-px after:rounded-[inherit] after:border after:border-accent after:bg-(--primary)/12 after:opacity-0 after:shadow-[0_0_16px_color-mix(in_srgb,var(--primary)_20%,transparent)] motion-safe:after:animate-folder-highlight",
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-secondary transition-colors group-hover:text-primary">
                <FolderIcon aria-hidden className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {levelFolderName || "No folder selected"}
                </span>
                <span className="mt-0.5 block text-xs text-secondary">
                  {levelFolderName ? "Change folder" : "Choose a folder"}
                </span>
              </span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-separator bg-primary/20 p-4 text-secondary">
            <FolderIcon aria-hidden className="size-6 shrink-0" />
            <p className="text-sm">Folder access unavailable</p>
          </div>
        )}
      </section>

      <footer className="-mr-2.5 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <p className="flex items-center gap-1.5 text-sm whitespace-nowrap text-secondary">
          <span className="font-medium text-primary">Bear Level Editor</span>
          <span>by Pab</span>
          <img src={datGif} alt="" className="h-3 w-auto shrink-0 rounded-sm" />
        </p>
      </footer>
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
  const customDefaultLevelTemplate = useCustomDefaultLevelTemplate();
  const setCustomDefaultLevelTemplate = useSetCustomDefaultLevelTemplate();
  const vertexEdgeClickBehavior = useVertexEdgeClickPreference();
  const customTemplateInputRef = useRef<HTMLInputElement | null>(null);
  const [customTemplateError, setCustomTemplateError] = useState<string | null>(
    null,
  );
  const { setVertexEdgeClickBehavior: setEditorVertexEdgeClickBehavior } =
    store.getState().actions;
  const handleCustomTemplateUpload = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    try {
      const level = await editorLevelFromFile(file);
      setCustomDefaultLevelTemplate(level);
      setDefaultLevelPreset("custom");
      setCustomTemplateError(null);
    } catch (error) {
      setCustomTemplateError(
        error instanceof Error ? error.message : "Could not import template.",
      );
    }
  };
  return (
    <TabsContent value="default-level" className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SettingsSectionHeading
          title="Starter template"
          description="Start new levels with this layout."
        />

        <div className="grid gap-3 sm:grid-cols-2">
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
                    : "border-separator hover:border-blue-400/60 hover:bg-blue-500/5",
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
          <div
            className={cn(
              "relative aspect-[16/7] min-h-[84px] overflow-hidden rounded-xl border transition-colors",
              defaultLevelPreset === "custom"
                ? "border-blue-400 bg-blue-500/10"
                : "border-separator hover:border-blue-400/60",
            )}
          >
            {customDefaultLevelTemplate ? (
              <>
                <button
                  type="button"
                  onClick={() => setDefaultLevelPreset("custom")}
                  className="absolute inset-0 cursor-pointer text-left focus-visible:focus-ring"
                  aria-pressed={defaultLevelPreset === "custom"}
                >
                  <LevelPresetPreview
                    preset="custom"
                    customLevel={customDefaultLevelTemplate}
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 via-black/10 to-transparent px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-white/85">
                        Custom
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => customTemplateInputRef.current?.click()}
                  className="absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white/90 shadow-sm transition-colors hover:bg-black/70 focus-visible:focus-ring"
                  aria-label="Replace custom template"
                >
                  <PlusIcon className="size-5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => customTemplateInputRef.current?.click()}
                className="relative flex h-full w-full cursor-pointer items-center justify-center bg-transparent focus-visible:focus-ring"
              >
                <PlusIcon className="size-7 text-primary/70" />
                <span className="absolute bottom-2 left-3 text-xs font-medium text-primary/85">
                  Custom
                </span>
              </button>
            )}
            <Input
              ref={customTemplateInputRef}
              type="file"
              accept=".lev"
              className="hidden"
              onChange={handleCustomTemplateUpload}
            />
          </div>
        </div>
        {customTemplateError && (
          <p className="text-sm text-red-300">{customTemplateError}</p>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <SettingsSectionHeading
          title="Vertex tool behavior"
          description="Choose how clicks edit polygons."
        />

        <div className="grid gap-3 sm:grid-cols-2">
          {vertexEdgeClickBehaviors.map((behavior) => {
            const isSelected = vertexEdgeClickBehavior === behavior.id;
            return (
              <button
                key={behavior.id}
                type="button"
                onClick={() => setEditorVertexEdgeClickBehavior(behavior.id)}
                className={cn(
                  "flex h-full cursor-pointer flex-col justify-start rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:focus-ring",
                  isSelected
                    ? "border-blue-400 bg-blue-500/10"
                    : "border-separator hover:border-blue-400/60",
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
      </section>
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <SettingsSectionHeading
          title="Controls"
          description="Set the keys used in play mode."
        >
          <Button
            type="button"
            onClick={() => setPlaySettings(defaultPlaySettings)}
            className="ml-auto h-6 px-2"
            size="sm"
            iconBefore={<ArrowCounterClockwiseIcon />}
          >
            Reset settings
          </Button>
        </SettingsSectionHeading>
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
      <div className="flex flex-col gap-3">
        <SettingsSectionHeading
          title="Run behavior"
          description="Choose what happens when a run ends."
        />
        <div className="grid gap-y-2 sm:grid-cols-2 sm:gap-x-32">
          <label className="flex items-center justify-between">
            <span className="min-w-24 text-sm">When run ends</span>
            <Select
              value={playSettings.runEndBehavior}
              items={playRunEndBehaviors.map((behavior) => ({
                value: behavior.id,
                label: behavior.label,
              }))}
              onValueChange={(value) => {
                if (value) setPlaySettings({ runEndBehavior: value });
              }}
            >
              <SelectTrigger className="h-9 w-32 min-w-0 px-3 font-normal">
                <SelectValue />
                <SelectTriggerIcon />
              </SelectTrigger>
              <SelectContent>
                {playRunEndBehaviors.map((behavior) => (
                  <SelectItem key={behavior.id} value={behavior.id}>
                    {behavior.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
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
      <Input
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
        className={cn("w-32", isCapturing && "border-blue-400 bg-blue-500/10")}
      />
    </label>
  );
}

function formatPlayKeyCode(code: string) {
  if (code.startsWith("Key")) return code.slice(3);
  return code;
}

function LevelPresetPreview({
  preset,
  customLevel,
}: {
  preset: DefaultLevelPreset;
  customLevel?: EditorLevel | null;
}) {
  const lgrAssets = useLgrAssets();
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
          lgrAssets: lgrAssets.lgr ?? undefined,
          store: createEditorStore({
            initialPreferences: {
              animateSprites: false,
              isUIVisible: true,
              levelVisibility: {
                ...defaultLevelVisibility,
                showObjectAnimations: false,
              },
              playModeZoom: DEFAULT_PLAY_MODE_ZOOM,
              playSettings: defaultPlaySettings,
              vertexEdgeClickBehavior: "default",
              autoGrassOptions: defaultAutoGrassOptions,
            },
          }),
          initialDocument: {
            level: getDefaultLevel(preset, customLevel),
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
    [customLevel, lgrAssets.lgr, preset],
  );

  return (
    <div
      ref={wrapperRef}
      className="relative aspect-[16/7] min-h-[84px] w-full bg-[#0f1720]"
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 block h-full w-full"
        aria-hidden="true"
      />
    </div>
  );
}
