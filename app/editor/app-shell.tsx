import { lazy, Suspense } from "react";
import { useHotkeys } from "@mantine/hooks";
import { ControlToolbar } from "~/editor/edit-mode/toolbars/control-toolbar";
import { HeaderToolbar } from "~/editor/edit-mode/toolbars/header-toolbar";
import { CanvasToolbar } from "~/editor/edit-mode/toolbars/canvas-toolbar";
import { EditorContextMenu } from "~/editor/edit-mode/context-menu";
import type { EditorEngine } from "~/editor/edit-mode/engine/editor-engine";
import {
  useEditorActions,
  useEditorIsPlayMode,
  useEditorIsUIVisible,
} from "~/editor/use-editor-store";
import {
  EditorView,
  useEditorView,
  useInitialLevel,
} from "~/editor/edit-mode/editor-view";
import type { WorldSceneRendererBackend } from "~/editor/render/world-scene-renderer";

const LazyPlayModeOverlay = lazy(async () => {
  const module = await import("~/editor/play-mode/play-mode-overlay");
  return { default: module.PlayModeOverlay };
});

type EditorShellProps = {
  initialLevelName?: string;
  isOpenAIEnabled?: boolean;
  rendererBackend?: WorldSceneRendererBackend;
};

export function EditorShell({
  initialLevelName,
  isOpenAIEnabled,
  rendererBackend = "canvas",
}: EditorShellProps) {
  const initialDocument = useInitialLevel(initialLevelName);
  const { canvasRef, engineRef } = useEditorView({
    initialDocument,
    isOpenAIEnabled,
    rendererBackend,
  });
  const isPlayMode = useEditorIsPlayMode();

  return (
    <>
      <div className="relative flex-1">
        <EditorView ref={canvasRef} />
        {isPlayMode ? (
          <Suspense fallback={<PlayModeOverlayFallback />}>
            <LazyPlayModeOverlay rendererBackend={rendererBackend} />
          </Suspense>
        ) : null}
      </div>
      <EditorToolbars
        engineRef={engineRef}
        isLoading={initialDocument.status === "loading"}
      />
      <EditorContextMenu />
    </>
  );
}

function PlayModeOverlayFallback() {
  return (
    <div className="absolute inset-0 z-60 flex items-center justify-center bg-black/8">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-medium text-white/80 shadow-sm backdrop-blur-sm">
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/75" />
        <span>Starting play mode</span>
      </div>
    </div>
  );
}

function EditorToolbars({
  engineRef,
  isLoading,
}: {
  engineRef: React.RefObject<EditorEngine | null>;
  isLoading?: boolean;
}) {
  const { toggleUIVisibility } = useEditorActions();
  const isUIVisible = useEditorIsUIVisible();
  const isPlayMode = useEditorIsPlayMode();
  useHotkeys([["mod + .", () => toggleUIVisibility()]]);

  if (!isUIVisible || isPlayMode) return null;
  return (
    <>
      <HeaderToolbar isLoading={isLoading} />
      <ControlToolbar />
      <CanvasToolbar engineRef={engineRef} />
    </>
  );
}
