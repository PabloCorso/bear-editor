import {
  useEditorIsPlayMode,
  useEditorActions,
  useEditorActiveTool,
  useEditorDocumentSession,
  useEditorStore,
  useLevelName,
} from "~/editor/use-editor-store";
import { useEditorDocumentGuard } from "~/editor/session/document-guard";
import { getLevelSnapshot } from "~/editor/editor-store";
import {
  Toolbar,
  ToolbarButton,
  type ToolbarProps,
} from "~/components/ui/toolbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  CaretRightIcon,
  CaretDownIcon,
  CheckIcon,
  ChecksIcon,
  CursorClickIcon,
  FilePlusIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  GearIcon,
  WarningDiamondIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  getDefaultLevel,
  editorLevelFromFile,
  elmaLevelFromEditorState,
} from "~/editor/helpers/level-parser";
import { useDefaultLevelPreset } from "~/editor/edit-mode/default-level-preset";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { supportsFilePickers } from "~/editor/helpers/file-session";
import { SettingsDialog } from "~/editor/edit-mode/edit-settings";
import { IconButton } from "~/components/ui/button";
import { Icon } from "~/components/ui/icon";
import { checkModifierKey, cn, useModifier } from "~/utils/misc";
import { LevelVisibilityControl } from "./level-visibility-control";
import { LevelPropertiesControl } from "./level-properties-control";
import type { EditorDocumentOrigin } from "~/editor/editor-state";
import {
  getTopologySelection,
  type TopologyCheckResult,
  type TopologyIssue,
  validateLevelTopology,
} from "~/editor/helpers/level-topology";
import type { SelectToolState } from "~/editor/edit-mode/tools/select-tool";
import { focusPositionsInView } from "~/editor/helpers/camera-helpers";
import { Logo } from "~/components/logo";
import { ToolButton } from "./tool";

const ISSUE_FOCUS_MIN_ZOOM = 0.2;
const ISSUE_FOCUS_MAX_ZOOM = 10000;
const HEADER_DROPDOWN_COLLISION_PADDING = 16;

type HeaderToolbarProps = ToolbarProps & { isLoading?: boolean };

export function HeaderToolbar({
  className,
  isLoading,
  ...props
}: HeaderToolbarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [topologyResult, setTopologyResult] =
    useState<TopologyCheckResult | null>(null);
  const { handleOpenFile, handleSave } = useMainMenuActions();

  useEffect(
    function registerMainMenuHotkeys() {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape" && topologyResult) {
          event.preventDefault();
          setTopologyResult(null);
          return;
        }

        const isModifierPressed = checkModifierKey(event);
        if (!isModifierPressed) return;

        const key = event.key.toLowerCase();
        if (key === "s") {
          event.preventDefault();
          void handleSave();
          return;
        }

        if (key === "o") {
          event.preventDefault();
          void handleOpenFile();
          return;
        }

        if (key === ",") {
          event.preventDefault();
          setSettingsOpen(true);
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    },
    [handleOpenFile, handleSave, topologyResult],
  );

  return (
    <>
      <div
        className={cn(
          "pointer-events-none absolute inset-x-4 top-4 z-10",
          className,
        )}
        {...props}
      >
        <Toolbar className="pointer-events-auto relative max-w-full gap-2 overflow-auto sm:hidden">
          <MainDropdownMenu onOpenSettings={() => setSettingsOpen(true)} />
          <LevelVisibilityControl />
          <LevelPropertiesControl />
          <LevelNameControl isLoading={isLoading} />
          <LevelFileName />
          <TopologyCheck
            setTopologyResult={setTopologyResult}
            isLoading={isLoading}
          />
          <PlayModeControl />
        </Toolbar>

        <div className="hidden grid-cols-[120px_minmax(0,1fr)_120px] gap-4 sm:grid">
          <Toolbar className="pointer-events-auto w-fit gap-2">
            <MainDropdownMenu onOpenSettings={() => setSettingsOpen(true)} />
            <LevelVisibilityControl />
          </Toolbar>

          <Toolbar className="pointer-events-auto relative w-fit gap-2 justify-self-center">
            <LevelPropertiesControl />
            <LevelNameControl isLoading={isLoading} />
            <LevelFileName />
            <TopologyCheck
              setTopologyResult={setTopologyResult}
              isLoading={isLoading}
            />
          </Toolbar>

          <Toolbar className="pointer-events-auto w-fit gap-2 justify-self-end">
            <PlayModeControl />
          </Toolbar>
        </div>

        <div className="pointer-events-none mt-2 flex justify-center">
          <TopologyResultPanel
            key={getTopologyResultKey(topologyResult)}
            result={topologyResult}
            onClose={() => setTopologyResult(null)}
          />
        </div>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

function PlayModeControl() {
  const { startPlayMode, stopPlayMode } = useEditorActions();
  const isPlayMode = useEditorIsPlayMode();

  return (
    <ToolButton
      name={isPlayMode ? "Stop play mode" : "Play mode"}
      shortcut={isPlayMode ? "Escape" : "Enter"}
      onClick={isPlayMode ? stopPlayMode : () => startPlayMode()}
    >
      {isPlayMode ? <XIcon /> : <CaretRightIcon weight="fill" />}
    </ToolButton>
  );
}

function useMainMenuActions() {
  const {
    replaceDocument,
    triggerFitToView,
    markDocumentSaved,
    setDocumentSaveState,
  } = useEditorActions();

  const store = useEditorStore();
  const activeTool = useEditorActiveTool();
  const { confirmDiscardChanges } = useEditorDocumentGuard();
  const defaultLevelPreset = useDefaultLevelPreset();
  const isPickerActionRunningRef = useRef(false);

  const runWithPickerGuard = useCallback(
    async <T,>(action: () => Promise<T>) => {
      if (isPickerActionRunningRef.current) {
        return undefined;
      }

      isPickerActionRunningRef.current = true;
      try {
        return await action();
      } finally {
        isPickerActionRunningRef.current = false;
      }
    },
    [],
  );

  const handleOpenFile = useCallback(async () => {
    await runWithPickerGuard(async () => {
      const shouldContinue = await confirmDiscardChanges();
      if (!shouldContinue) return;

      const fileSession = store.getState().fileSession;
      const openResult = await fileSession.open();
      if (!openResult) return;

      const fileName = openResult.fileName.endsWith(".lev")
        ? openResult.fileName
        : `${openResult.fileName}.lev`;
      const file =
        openResult.contents instanceof ArrayBuffer
          ? new File([new Uint8Array(openResult.contents)], fileName)
          : new File([openResult.contents], fileName);

      try {
        const level = await editorLevelFromFile(file);
        activeTool?.clear?.();
        replaceDocument({
          level,
          origin: { kind: "file", label: "File", canOverwrite: true },
          displayName: fileName,
          hasExternalHandle: true,
        });
        triggerFitToView();
      } catch (error) {
        alert(
          `Import failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    });
  }, [
    activeTool,
    confirmDiscardChanges,
    replaceDocument,
    runWithPickerGuard,
    store,
    triggerFitToView,
  ]);

  const handleNew = useCallback(async () => {
    const shouldContinue = await confirmDiscardChanges();
    if (!shouldContinue) return;

    activeTool?.clear?.();
    store.getState().fileSession.clear();
    const defaultLevel = getDefaultLevel(defaultLevelPreset);
    replaceDocument({
      level: defaultLevel,
      origin: { kind: "default", label: "Untitled", canOverwrite: false },
      displayName: "Untitled",
      hasExternalHandle: false,
    });
    triggerFitToView();
  }, [
    activeTool,
    confirmDiscardChanges,
    defaultLevelPreset,
    replaceDocument,
    store,
    triggerFitToView,
  ]);

  const getSavedOrigin = (hasExternalHandle: boolean): EditorDocumentOrigin =>
    hasExternalHandle
      ? { kind: "file", label: "File", canOverwrite: true }
      : { kind: "download", label: "Downloaded file", canOverwrite: false };

  const resetSaveState = useCallback(() => {
    const dirty = store.getState().documentSession.dirty;
    setDocumentSaveState(dirty ? "dirty" : "clean");
  }, [setDocumentSaveState, store]);

  const handleSaveAs = useCallback(async () => {
    await runWithPickerGuard(async () => {
      try {
        const state = store.getState();
        const fileSession = state.fileSession;
        const baselineLevel = getLevelSnapshot(state);
        const level = elmaLevelFromEditorState(state);
        setDocumentSaveState("saving");

        const result = await fileSession.saveAs(level);
        if (!result) {
          resetSaveState();
          return;
        }

        const hasExternalHandle = result.mode === "file";
        markDocumentSaved({
          baselineLevel,
          origin: getSavedOrigin(hasExternalHandle),
          displayName:
            (hasExternalHandle ? result.fileName : undefined) ||
            `${level.name}.lev`,
          hasExternalHandle,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to save level.";
        setDocumentSaveState("error", message);
        alert(message);
      }
    });
  }, [
    markDocumentSaved,
    resetSaveState,
    runWithPickerGuard,
    setDocumentSaveState,
    store,
  ]);

  const handleSave = useCallback(async () => {
    try {
      const state = store.getState();
      const fileSession = state.fileSession;
      const baselineLevel = getLevelSnapshot(state);
      setDocumentSaveState("saving");

      if (!fileSession.hasFile) {
        return handleSaveAs();
      }

      const result = await fileSession.save();
      if (!result) {
        resetSaveState();
        return;
      }

      const hasExternalHandle = result.mode === "file";
      markDocumentSaved({
        baselineLevel,
        origin: getSavedOrigin(hasExternalHandle),
        displayName:
          (hasExternalHandle ? result.fileName : undefined) ||
          `${store.getState().levelName || "Untitled"}.lev`,
        hasExternalHandle,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save level.";
      setDocumentSaveState("error", message);
      alert(message);
    }
  }, [
    handleSaveAs,
    markDocumentSaved,
    resetSaveState,
    setDocumentSaveState,
    store,
  ]);

  return { handleNew, handleOpenFile, handleSave, handleSaveAs };
}

function MainDropdownMenu({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { handleNew, handleOpenFile, handleSave, handleSaveAs } =
    useMainMenuActions();
  const modifier = useModifier();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <ToolbarButton
            className="relative w-14 gap-0"
            aria-label="Bear Level Editor"
          >
            <Logo className="isolate h-8 w-8" />
            <Icon size="xs">
              <CaretDownIcon />
            </Icon>
          </ToolbarButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          collisionPadding={HEADER_DROPDOWN_COLLISION_PADDING}
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              iconBefore={<FilePlusIcon />}
              shortcut={`${modifier} + R`}
              onClick={() => {
                void handleNew();
              }}
            >
              New
            </DropdownMenuItem>
            <DropdownMenuItem
              iconBefore={<FolderOpenIcon />}
              shortcut={`${modifier} + O`}
              onClick={() => {
                void handleOpenFile();
              }}
            >
              Open
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              iconBefore={<FloppyDiskIcon />}
              shortcut={`${modifier} + S`}
              onClick={() => {
                void handleSave();
              }}
            >
              Save
            </DropdownMenuItem>
            {supportsFilePickers() && (
              <DropdownMenuItem
                iconBefore={<FilePlusIcon />}
                onClick={() => {
                  void handleSaveAs();
                }}
              >
                Save as…
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              iconBefore={<GearIcon />}
              shortcut={`${modifier} + ,`}
              onClick={onOpenSettings}
            >
              Settings
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function TopologyCheck({
  setTopologyResult,
  isLoading,
  className,
  ...props
}: React.ComponentProps<typeof ToolbarButton> & {
  setTopologyResult: React.Dispatch<
    React.SetStateAction<TopologyCheckResult | null>
  >;
  isLoading?: boolean;
}) {
  const handleCheckTopology = useTopologyCheckAction(setTopologyResult);
  return (
    <ToolbarButton
      onClick={handleCheckTopology}
      disabled={isLoading || props.disabled}
      className={cn({ "animate-pulse": isLoading }, className)}
      {...props}
    >
      <CheckIcon className={cn({ invisible: isLoading })} />
    </ToolbarButton>
  );
}

function useTopologyCheckAction(
  setTopologyResult: React.Dispatch<
    React.SetStateAction<TopologyCheckResult | null>
  >,
) {
  const store = useEditorStore();

  return useCallback(() => {
    const state = store.getState();
    const result = validateLevelTopology({
      polygons: state.polygons,
      flowers: state.flowers,
    });
    setTopologyResult(result);
  }, [setTopologyResult, store]);
}

function useTopologyIssueSelection() {
  const store = useEditorStore();
  const { activateTool, setToolState } = useEditorActions();

  return useCallback(
    (issue: TopologyIssue) => {
      const state = store.getState();
      const selectedVertices = getTopologySelection(state.polygons, [issue]);
      const canvas = document.querySelector("canvas");
      const viewportWidth = canvas?.clientWidth ?? window.innerWidth;
      const viewportHeight = canvas?.clientHeight ?? window.innerHeight;

      activateTool("select");
      setToolState<SelectToolState>("select", {
        selectedVertices,
        selectedObjects: [],
        selectedPictures: [],
        hoveredObject: undefined,
        hoveredPictureBounds: undefined,
        contextMenuType: undefined,
      });

      if (issue.vertices.length > 0) {
        focusPositionsInView({
          positions: issue.vertices,
          viewportWidth,
          viewportHeight,
          minZoom: ISSUE_FOCUS_MIN_ZOOM,
          maxZoom: ISSUE_FOCUS_MAX_ZOOM,
          setCamera: state.actions.setCamera,
          setZoom: state.actions.setZoom,
        });
      }
    },
    [activateTool, setToolState, store],
  );
}

function TopologyResultPanel({
  className,
  result,
  onClose,
  ...props
}: Omit<React.ComponentPropsWithRef<"section">, "children"> & {
  result: TopologyCheckResult | null;
  onClose: () => void;
}) {
  const selectIssue = useTopologyIssueSelection();
  const [activeIssueIndex, setActiveIssueIndex] = useState<number | null>(null);

  if (!result) return null;

  const hasIssues = result.issues.length > 0;

  return (
    <section
      className={cn(
        "pointer-events-auto max-w-2xl rounded-xl bg-screen p-2 shadow-sm",
        className,
      )}
      aria-live="polite"
      {...props}
    >
      <header className="flex items-center gap-2 pl-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {hasIssues ? (
              <Icon className="text-red-400">
                <WarningDiamondIcon />
              </Icon>
            ) : (
              <Icon className="text-green-400">
                <ChecksIcon />
              </Icon>
            )}
            {hasIssues
              ? `Found ${result.issues.length} issue${result.issues.length === 1 ? "" : "s"}`
              : "Everything seems to be all right."}
          </p>
        </div>
        <IconButton
          size="sm"
          className="text-secondary"
          aria-label="Close topology results"
          onClick={onClose}
        >
          <XIcon />
        </IconButton>
      </header>

      {hasIssues && (
        <div className="p-1.5 pt-2">
          <div className="max-h-32 overflow-y-auto">
            <ol className="flex flex-col gap-1.5">
              {result.issues.map((issue, index) => {
                const canSelectIssue = issue.vertices.length > 0;
                return (
                  <li
                    key={`${issue.type}-${index}`}
                    className={cn(
                      "flex items-center gap-2 rounded-lg bg-white/5 p-1 pl-3",
                      activeIssueIndex === index &&
                        "bg-white/10 ring-1 ring-white/15",
                    )}
                  >
                    <div className="min-w-0 flex-1 text-sm text-white/90">
                      <span className="font-medium text-white">
                        {index + 1}.
                      </span>{" "}
                      {issue.message}
                    </div>
                    {canSelectIssue && (
                      <IconButton
                        size="sm"
                        onClick={() => {
                          setActiveIssueIndex(index);
                          selectIssue(issue);
                        }}
                        className="ml-auto"
                        aria-label="View issue"
                      >
                        <CursorClickIcon />
                      </IconButton>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}

function getTopologyResultKey(result: TopologyCheckResult | null) {
  if (!result) return "topology:none";

  return `topology:${result.issues
    .map((issue) => `${issue.type}:${issue.message}`)
    .join("|")}`;
}

function LevelTitleInput({
  className,
  isLoading,
  ...props
}: React.ComponentPropsWithRef<"input"> & { isLoading?: boolean }) {
  const { setLevelName } = useEditorActions();
  const levelName = useLevelName();
  return (
    <input
      type="text"
      name="level-name"
      value={isLoading ? "" : levelName}
      onChange={(e) => setLevelName(e.target.value)}
      className={cn(
        "min-w-[12rem] flex-1 rounded border border-gray-600 bg-gray-700 px-3 py-1 text-sm text-white focus-visible:focus-ring",
        { "animate-pulse": isLoading },
        className,
      )}
      placeholder={isLoading ? "" : "Enter level name…"}
      disabled={isLoading}
      {...props}
    />
  );
}

function LevelNameControl({ isLoading }: { isLoading?: boolean }) {
  return (
    <div className="relative flex min-w-[12rem] flex-1">
      <LevelTitleInput isLoading={isLoading} className="pr-5" />
      <LevelSaveStateIndicator className="top-0 right-0 translate-x-1/2 -translate-y-1/2" />
    </div>
  );
}

function LevelFileName({
  className,
  ...props
}: React.ComponentPropsWithRef<"div">) {
  const documentSession = useEditorDocumentSession();
  const fileName = documentSession.hasExternalHandle
    ? documentSession.displayName
    : null;
  if (!fileName) return null;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center text-sm text-white/80",
        className,
      )}
      {...props}
    >
      <span className="max-w-[16rem] truncate rounded bg-white/5 px-2 py-1 text-white/70">
        {fileName}
      </span>
    </div>
  );
}

function LevelSaveStateIndicator({
  className,
  ...props
}: React.ComponentPropsWithRef<"span">) {
  const documentSession = useEditorDocumentSession();
  const saveStateLabel =
    documentSession.saveState === "saving"
      ? "Saving..."
      : documentSession.saveState === "error"
        ? "Save failed"
        : documentSession.dirty
          ? "Unsaved"
          : null;

  if (!saveStateLabel) return null;

  return (
    <span
      title={saveStateLabel}
      aria-label={saveStateLabel}
      className={cn(
        "absolute size-2 shrink-0 rounded-full bg-white",
        {
          "bg-red-400": documentSession.saveState === "error",
          "animate-pulse": documentSession.saveState === "saving",
        },

        className,
      )}
      {...props}
    />
  );
}
