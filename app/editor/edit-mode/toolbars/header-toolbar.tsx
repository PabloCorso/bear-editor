import { TestStartPicker } from "../test-start-controls";
import {
  DEFAULT_LEVEL_TITLE,
  LEVEL_TITLE_MAX_LENGTH,
} from "~/editor/helpers/level-title";
import { Input } from "~/components/ui/input";
import {
  useEditorIsPlayMode,
  useEditorActions,
  useEditorActiveTool,
  useEditorDocumentSession,
  useEditorStore,
  useEditor,
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
  CaretLeftIcon,
  CaretDownIcon,
  CheckIcon,
  ChecksIcon,
  CursorClickIcon,
  FilePlusIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  GearIcon,
  ImageIcon,
  WarningDiamondIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  getDefaultLevel,
  editorLevelFromFile,
  elmaLevelFromEditorState,
} from "~/editor/helpers/level-parser";
import {
  useCustomDefaultLevelTemplate,
  useDefaultLevelPreset,
} from "~/editor/edit-mode/default-level-preset";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { supportsFilePickers } from "~/editor/helpers/file-session";
import { SettingsDialog } from "~/editor/edit-mode/edit-settings";
import { IconButton } from "~/components/ui/button";
import { Icon } from "~/components/ui/icon";
import { checkModifierKey, cn, getModifier, useModifier } from "~/utils/misc";
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
import { ToolButton } from "~/components/tool-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip.js";

import { getNewLevelShortcut, isNewLevelShortcut } from "./keyboard-shortcuts";
import { LevelFolderTip } from "./level-folder-tip";
import { ToolInfo } from "./tool-info";
import { CanvasTips } from "./canvas-tip";
import "./level-file-name.css";
import type { EditorEngine } from "~/editor/edit-mode/engine/editor-engine";
import { ExportImageDialog } from "./export-image-dialog";
import type { ImageExport } from "~/editor/helpers/image-export";

const ISSUE_FOCUS_MIN_ZOOM = 0.2;
const ISSUE_FOCUS_MAX_ZOOM = 10000;
const HEADER_DROPDOWN_COLLISION_PADDING = 16;

type HeaderToolbarProps = ToolbarProps & {
  isLoading?: boolean;
  engineRef: React.RefObject<EditorEngine | null>;
  fileNameEntrance: ReturnType<typeof useLevelFileNameEntrance>;
};

// Keep this state above the toolbars that unmount in play mode or with hidden UI.
export function useLevelFileNameEntrance(isVisible: boolean) {
  const store = useEditorStore();
  const documentSession = useEditorDocumentSession();
  const sessionId = documentSession.clipboardSessionId;
  const [entrance, setEntrance] = useState({
    sessionId,
    isEntering: isVisible && documentSession.hasExternalHandle,
  });

  if (entrance.sessionId !== sessionId) {
    setEntrance({
      sessionId,
      isEntering: isVisible && documentSession.hasExternalHandle,
    });
  } else if (!isVisible && entrance.isEntering) {
    setEntrance({ sessionId, isEntering: false });
  }

  return {
    sessionId,
    isEntering: entrance.isEntering,
    onEnd() {
      setEntrance((current) => ({ ...current, isEntering: false }));
    },
    onNavigate() {
      // Folder carets replace the document too, but should keep the label still.
      setEntrance({
        sessionId: store.getState().documentSession.clipboardSessionId,
        isEntering: false,
      });
    },
  };
}

export function HeaderToolbar({
  className,
  isLoading,
  fileNameEntrance,
  engineRef,
  ...props
}: HeaderToolbarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [highlightLevelFolder, setHighlightLevelFolder] = useState(false);
  const [topologyResult, setTopologyResult] =
    useState<TopologyCheckResult | null>(null);
  const menuActions = useMainMenuActions();
  const { handleNew, handleOpenFile, handleSave } = menuActions;
  const store = useEditorStore();

  const [imageExport, setImageExport] = useState<{
    snapshot: ImageExport;
    fileName?: string;
  } | null>(null);
  const handleExportImage = () => {
    try {
      const engine = engineRef.current;
      if (!engine)
        throw new Error("The level is still loading. Please try again.");
      const { fileSession, documentSession } = store.getState();
      setImageExport({
        snapshot: engine.createImageExport(),
        fileName: fileSession.fileName ?? documentSession.displayName,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to export image.");
    }
  };

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

      const handleNewLevelKeyDown = (event: KeyboardEvent) => {
        if (!isNewLevelShortcut(event, getModifier() === "⌘")) return;
        if (
          event.target instanceof Element &&
          event.target.closest('[role="dialog"]')
        )
          return;
        if (event.repeat) return;

        event.preventDefault();
        event.stopPropagation();
        void handleNew();
      };

      // Claim New before canvas tools can interpret N as a tool action.
      window.addEventListener("keydown", handleNewLevelKeyDown, true);
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleNewLevelKeyDown, true);
        window.removeEventListener("keydown", handleKeyDown);
      };
    },
    [handleNew, handleOpenFile, handleSave, topologyResult],
  );

  return (
    <>
      {imageExport && (
        <ExportImageDialog
          snapshot={imageExport.snapshot}
          initialFileName={imageExport.fileName}
          onClose={() => setImageExport(null)}
        />
      )}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-4 top-4 z-10",
          className,
        )}
        {...props}
      >
        <Toolbar className="pointer-events-auto relative max-w-full gap-2 overflow-auto sm:hidden">
          <MainDropdownMenu
            actions={menuActions}
            onExportImage={handleExportImage}
            isLoading={isLoading}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <LevelVisibilityControl />
          <LevelPropertiesControl />
          <LevelNameControl isLoading={isLoading} />
          <TopologyCheck
            setTopologyResult={setTopologyResult}
            isLoading={isLoading}
          />
          <TestStartPicker mobile />
          <PlayModeControl />
        </Toolbar>

        <div className="hidden grid-cols-[120px_minmax(0,1fr)_120px] gap-4 sm:grid">
          <Toolbar className="pointer-events-auto w-fit gap-2">
            <MainDropdownMenu
              actions={menuActions}
              onExportImage={handleExportImage}
              isLoading={isLoading}
              onOpenSettings={() => setSettingsOpen(true)}
            />
            <LevelVisibilityControl />
          </Toolbar>

          <Toolbar className="pointer-events-auto relative w-fit gap-2 justify-self-center">
            <LevelPropertiesControl />
            <LevelNameControl isLoading={isLoading} />
            <TopologyCheck
              setTopologyResult={setTopologyResult}
              isLoading={isLoading}
            />
          </Toolbar>

          <Toolbar className="pointer-events-auto w-fit gap-2 justify-self-end">
            <TestStartPicker />
            <PlayModeControl />
          </Toolbar>
        </div>

        <LevelFileName
          key={fileNameEntrance.sessionId}
          className="justify-center"
          isLoading={isLoading}
          entrance={fileNameEntrance}
        />

        <div className="pointer-events-none mt-2 flex justify-center">
          <TopologyResultPanel
            key={getTopologyResultKey(topologyResult)}
            result={topologyResult}
            onClose={() => setTopologyResult(null)}
          />
        </div>
      </div>
      <CanvasTips>
        <LevelFolderTip
          onOpenSettings={() => {
            setHighlightLevelFolder(true);
            setSettingsOpen(true);
          }}
        />
        <ToolInfo />
      </CanvasTips>
      <SettingsDialog
        open={settingsOpen}
        highlightLevelFolder={highlightLevelFolder}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setHighlightLevelFolder(false);
        }}
      />
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
  const customDefaultLevelTemplate = useCustomDefaultLevelTemplate();
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
    if (store.getState().documentSession.saveState === "saving") return;
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
    if (store.getState().documentSession.saveState === "saving") return;
    const shouldContinue = await confirmDiscardChanges();
    if (!shouldContinue) return;

    activeTool?.clear?.();
    await store.getState().fileSession.clear();
    const title = store.getState().defaultLevelTitle || DEFAULT_LEVEL_TITLE;
    const defaultLevel = getDefaultLevel(
      defaultLevelPreset,
      customDefaultLevelTemplate,
      title,
    );
    replaceDocument({
      level: defaultLevel,
      origin: { kind: "default", label: title, canOverwrite: false },
      displayName: title,
      hasExternalHandle: false,
    });
    triggerFitToView();
  }, [
    activeTool,
    confirmDiscardChanges,
    customDefaultLevelTemplate,
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
    if (store.getState().documentSession.saveState === "saving") return;
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
    if (store.getState().documentSession.saveState === "saving") return;
    try {
      const state = store.getState();
      const fileSession = state.fileSession;
      const baselineLevel = getLevelSnapshot(state);
      if (!fileSession.hasFile) {
        return handleSaveAs();
      }
      setDocumentSaveState("saving");

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

function MainDropdownMenu({
  onOpenSettings,
  actions,
  onExportImage,
  isLoading,
}: {
  onOpenSettings: () => void;
  actions: ReturnType<typeof useMainMenuActions>;
  onExportImage: () => void;
  isLoading?: boolean;
}) {
  const { handleNew, handleOpenFile, handleSave, handleSaveAs } = actions;
  const modifier = useModifier();

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger>
            <DropdownMenuTrigger>
              <ToolbarButton
                className="relative w-14 gap-0"
                aria-label="Main menu"
              >
                <Logo className="isolate h-8 w-8" />
                <Icon size="xs">
                  <CaretDownIcon />
                </Icon>
              </ToolbarButton>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Main menu</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          collisionPadding={HEADER_DROPDOWN_COLLISION_PADDING}
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              iconBefore={<FilePlusIcon />}
              shortcut={getNewLevelShortcut(modifier === "⌘")}
              onClick={() => {
                void handleNew();
              }}
            >
              New level
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
            <DropdownMenuItem
              iconBefore={<ImageIcon />}
              disabled={isLoading}
              onClick={() => {
                void onExportImage();
              }}
            >
              Export image…
            </DropdownMenuItem>
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
    <Tooltip>
      <TooltipTrigger>
        <ToolbarButton
          aria-label="Topology check"
          onClick={handleCheckTopology}
          disabled={isLoading || props.disabled}
          className={cn({ "animate-pulse": isLoading }, className)}
          {...props}
        >
          <CheckIcon className={cn({ invisible: isLoading })} />
        </ToolbarButton>
      </TooltipTrigger>
      <TooltipContent side="bottom">Typology check</TooltipContent>
    </Tooltip>
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
}: React.ComponentProps<typeof Input> & { isLoading?: boolean }) {
  const { setLevelName } = useEditorActions();
  const levelName = useLevelName();
  return (
    <Input
      type="text"
      name="level-name"
      maxLength={LEVEL_TITLE_MAX_LENGTH}
      value={isLoading ? "" : levelName}
      onChange={(e) => setLevelName(e.target.value)}
      className={cn(
        "min-w-[12rem] flex-1 px-3",
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
  isLoading,
  entrance,
  ...props
}: React.ComponentPropsWithRef<"div"> & {
  isLoading?: boolean;
  entrance: ReturnType<typeof useLevelFileNameEntrance>;
}) {
  const store = useEditorStore();
  const levelFolder = useEditor((state) => state.levelFolder);
  const folderRevision = useSyncExternalStore(
    levelFolder.subscribe,
    levelFolder.getSnapshot,
    () => 0,
  );
  const { replaceDocument, triggerFitToView } = useEditorActions();
  const { confirmDiscardChanges } = useEditorDocumentGuard();
  const documentSession = useEditorDocumentSession();
  const [folderLevels, setFolderLevels] = useState<string[]>([]);
  const [isNavigating, setIsNavigating] = useState(false);
  const navigatingRef = useRef(false);
  const fileName = documentSession.hasExternalHandle
    ? documentSession.displayName
    : null;
  useEffect(
    function syncLevelFolderFiles() {
      let cancelled = false;

      async function refreshLevels() {
        try {
          const names = (await levelFolder.hasAccess())
            ? await levelFolder.listLevels()
            : [];
          names.sort((a, b) =>
            a.localeCompare(b, undefined, {
              numeric: true,
              sensitivity: "base",
            }),
          );
          if (!cancelled) setFolderLevels(names);
        } catch {
          if (!cancelled) setFolderLevels([]);
        }
      }

      void refreshLevels();
      window.addEventListener("focus", refreshLevels);
      return function cleanupLevelFolderFiles() {
        cancelled = true;
        window.removeEventListener("focus", refreshLevels);
      };
    },
    [levelFolder, folderRevision, fileName],
  );

  const currentIndex = fileName ? folderLevels.indexOf(fileName) : -1;
  const canNavigateFolder = currentIndex >= 0 && folderLevels.length > 1;
  const previousFile = canNavigateFolder
    ? folderLevels[
        (currentIndex - 1 + folderLevels.length) % folderLevels.length
      ]
    : null;
  const nextFile = canNavigateFolder
    ? folderLevels[(currentIndex + 1) % folderLevels.length]
    : null;
  const navigationDisabled =
    isLoading || isNavigating || documentSession.saveState === "saving";

  async function navigateToLevel(name: string) {
    if (navigatingRef.current || navigationDisabled) return;
    navigatingRef.current = true;
    setIsNavigating(true);
    try {
      if (!(await confirmDiscardChanges())) return;
      if (!(await levelFolder.hasAccess())) {
        setFolderLevels([]);
        return;
      }
      const handle = await levelFolder.getLevelFileHandle(name);
      const level = await editorLevelFromFile(await handle.getFile());
      const result = await store.getState().fileSession.open(handle);
      if (!result) return;
      store.getState().actions.getActiveTool()?.clear?.();
      replaceDocument({
        level,
        origin: { kind: "file", label: "File", canOverwrite: true },
        displayName: result.fileName,
        hasExternalHandle: true,
      });
      entrance.onNavigate();
      triggerFitToView();
    } catch (error) {
      alert(`Import failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      navigatingRef.current = false;
      setIsNavigating(false);
    }
  }

  if (!fileName) return null;

  return (
    <div
      className={cn(
        "level-file-name pointer-events-auto mx-auto flex w-fit max-w-[20rem] items-center font-mono text-xs tracking-wide text-white/70",
        entrance.isEntering && "level-file-name-entering",
        className,
      )}
      onAnimationEnd={(event) => {
        if (event.animationName !== "level-file-name-flip") return;
        const target = event.target as HTMLElement;
        const isLastPiece = target.classList.contains(
          currentIndex >= 0 ? "level-file-name-next" : "level-file-name-label",
        );
        if (isLastPiece) {
          entrance.onEnd();
        }
      }}
      {...props}
    >
      {currentIndex >= 0 && (
        <Tooltip>
          <TooltipTrigger delay={1000}>
            <IconButton
              type="button"
              size="sm"
              className="level-file-name-piece level-file-name-previous size-7 rounded-none rounded-bl-xs bg-screen/80 shadow-[0_1px_2px_rgb(0_0_0/0.12)] disabled:opacity-100"
              aria-label={
                previousFile
                  ? `Previous level: ${previousFile}`
                  : "Previous level"
              }
              disabled={navigationDisabled || !previousFile}
              onClick={() => previousFile && void navigateToLevel(previousFile)}
            >
              <CaretLeftIcon
                aria-hidden
                className={!previousFile ? "opacity-40" : undefined}
              />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="left" className="font-mono text-xs">
            {previousFile ?? "No previous level"}
          </TooltipContent>
        </Tooltip>
      )}
      <span
        className={cn(
          "level-file-name-piece level-file-name-label h-7 w-[calc(12ch+1rem)] shrink-0 cursor-text truncate bg-screen/80 px-1 text-center leading-7 shadow-[0_1px_2px_rgb(0_0_0/0.12)] select-text",
          currentIndex < 0 && "rounded-b-xs",
        )}
      >
        {fileName}
      </span>
      {currentIndex >= 0 && (
        <Tooltip>
          <TooltipTrigger delay={1000}>
            <IconButton
              type="button"
              size="sm"
              className="level-file-name-piece level-file-name-next size-7 rounded-none rounded-br-xs bg-screen/80 shadow-[0_1px_2px_rgb(0_0_0/0.12)] disabled:opacity-100"
              aria-label={nextFile ? `Next level: ${nextFile}` : "Next level"}
              disabled={navigationDisabled || !nextFile}
              onClick={() => nextFile && void navigateToLevel(nextFile)}
            >
              <CaretRightIcon
                aria-hidden
                className={!nextFile ? "opacity-40" : undefined}
              />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-mono text-xs">
            {nextFile ?? "No next level"}
          </TooltipContent>
        </Tooltip>
      )}
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
