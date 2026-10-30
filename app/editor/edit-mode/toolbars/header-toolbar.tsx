import { TestStartPicker } from "../test-start-controls";
import { useLgrAssets } from "~/components/use-lgr-assets";
import { getLevelTopology } from "~/editor/helpers/level-topology";
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
  DotsThreeVerticalIcon,
  CaretRightIcon,
  CaretLeftIcon,
  CaretDownIcon,
  FilePlusIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  GearIcon,
  ImageIcon,
  InfoIcon,
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
import {
  SettingsDialog,
  type SettingsTab,
} from "~/editor/edit-mode/edit-settings";
import { IconButton } from "~/components/ui/button";
import { Icon } from "~/components/ui/icon";
import { checkModifierKey, cn, getModifier, useModifier } from "~/utils/misc";
import { LevelVisibilityControl } from "./level-visibility-control";
import { LevelPropertiesControl } from "./level-properties-control";
import type { EditorDocumentOrigin } from "~/editor/editor-state";
import { TopologyCheck, TopologyResultPanel } from "./topology-check";
import { Logo } from "~/components/logo";
import { ToolButton } from "~/components/tool-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip.js";

import { getNewLevelShortcut, isNewLevelShortcut } from "./keyboard-shortcuts";
import { LevelPropertiesDialog } from "./level-properties-dialog";
import { LevelFolderTip } from "./level-folder-tip";
import { ToolInfo } from "./tool-info";
import { CanvasTips } from "./canvas-tip";
import "./level-file-name.css";
import type { EditorEngine } from "~/editor/edit-mode/engine/editor-engine";
import { ExportImageDialog } from "./export-image-dialog";
import type { ImageExport } from "~/editor/helpers/image-export";

import {
  getAutoGrassAllShortcut,
  VertexIcon,
  getVertexIconProps,
} from "./vertex-tool-control";
import type { VertexTool } from "../tools/vertex-tool";

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
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [highlightLevelFolder, setHighlightLevelFolder] = useState(false);
  const topologyOpen = useEditor((state) => state.topologyInspection !== null);
  const { setTopologyInspection } = useEditorActions();
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
        if (event.key === "Escape" && topologyOpen) {
          event.preventDefault();
          setTopologyInspection(null);
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
          setSettingsTab("general");
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
    [
      handleNew,
      handleOpenFile,
      handleSave,
      topologyOpen,
      setTopologyInspection,
    ],
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
            onOpenSettings={() => {
              setSettingsTab("general");
              setSettingsOpen(true);
            }}
          />
          <LevelVisibilityControl />
          <LevelOptionsMenu
            isLoading={isLoading}
            onOpenProperties={() => setPropertiesOpen(true)}
            onOpenToolSettings={() => {
              setSettingsTab("tools");
              setSettingsOpen(true);
            }}
          />
          <LevelPropertiesControl />
          <LevelNameControl isLoading={isLoading} />
          <TopologyCheck isLoading={isLoading} />
          <TestStartPicker mobile />
          <PlayModeControl />
        </Toolbar>

        <div className="hidden grid-cols-[120px_minmax(0,1fr)_120px] gap-4 sm:grid">
          <Toolbar className="pointer-events-auto w-fit gap-2">
            <MainDropdownMenu
              actions={menuActions}
              onExportImage={handleExportImage}
              isLoading={isLoading}
              onOpenSettings={() => {
                setSettingsTab("general");
                setSettingsOpen(true);
              }}
            />
            <LevelVisibilityControl />
            <LevelOptionsMenu
              isLoading={isLoading}
              onOpenProperties={() => setPropertiesOpen(true)}
              onOpenToolSettings={() => {
                setSettingsTab("tools");
                setSettingsOpen(true);
              }}
            />
          </Toolbar>

          <Toolbar className="pointer-events-auto relative w-fit gap-2 justify-self-center">
            <LevelPropertiesControl />
            <LevelNameControl isLoading={isLoading} />
            <TopologyCheck isLoading={isLoading} />
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
          <TopologyResultPanel />
        </div>
      </div>
      <CanvasTips>
        <LevelFolderTip
          onOpenSettings={() => {
            setSettingsTab("general");
            setHighlightLevelFolder(true);
            setSettingsOpen(true);
          }}
        />
        <ToolInfo />
      </CanvasTips>
      <LevelPropertiesDialog
        open={propertiesOpen}
        onOpenChange={setPropertiesOpen}
      />
      <SettingsDialog
        open={settingsOpen}
        initialTab={settingsTab}
        highlightLevelFolder={highlightLevelFolder}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setHighlightLevelFolder(false);
        }}
      />
    </>
  );
}

function LevelOptionsMenu({
  isLoading,
  onOpenProperties,
  onOpenToolSettings,
}: {
  isLoading?: boolean;
  onOpenProperties: () => void;
  onOpenToolSettings: () => void;
}) {
  const { getTool } = useEditorActions();
  const modifier = useModifier();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger>
        <ToolButton name="Level options">
          <DotsThreeVerticalIcon weight="bold" />
        </ToolButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-64"
        collisionPadding={HEADER_DROPDOWN_COLLISION_PADDING}
      >
        <DropdownMenuItem
          iconBefore={<VertexIcon {...getVertexIconProps("autoGrass")} />}
          shortcut={getAutoGrassAllShortcut(modifier)}
          disabled={isLoading}
          onClick={() => getTool<VertexTool>("vertex")?.autoGrassAll()}
        >
          AutoGrass level
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem iconBefore={<InfoIcon />} onClick={onOpenProperties}>
          Level properties…
        </DropdownMenuItem>
        <DropdownMenuItem
          iconBefore={<GearIcon />}
          onClick={onOpenToolSettings}
        >
          Tool settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const { lgr } = useLgrAssets();
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

  const checkSavedLevel = useCallback(() => {
    const state = store.getState();
    if (!state.checkTopologyOnSave) return;
    // A diagnostic failure must not turn an already completed save into a
    // reported save failure. Inspection never mutates the document.
    try {
      const result = getLevelTopology(state, lgr);
      if (result.issues.length || result.truncated) {
        state.actions.setTopologyInspection(
          state.topologyInspection ?? {
            activeIssueId: null,
            activeCheckId: null,
            previewIssueId: null,
            showBounds: false,
          },
        );
      }
    } catch (error) {
      console.error("Topology check failed after saving:", error);
    }
  }, [store, lgr]);

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
        checkSavedLevel();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to save level.";
        setDocumentSaveState("error", message);
        alert(message);
      }
    });
  }, [
    checkSavedLevel,
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
      checkSavedLevel();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save level.";
      setDocumentSaveState("error", message);
      alert(message);
    }
  }, [
    checkSavedLevel,
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
