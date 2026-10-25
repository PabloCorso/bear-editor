import {
  UnionTool,
  SubtractTool,
  IntersectTool,
} from "./tools/polygon-boolean-tool";
import { DEFAULT_LEVEL_TITLE } from "~/editor/helpers/level-title";
import React from "react";
import { useEffect, useRef, useState } from "react";
import { EditorEngine } from "~/editor/edit-mode/engine/editor-engine";
import { useEditorStore } from "~/editor/use-editor-store";
import { VertexTool } from "~/editor/edit-mode/tools/vertex-tool";
import { SelectTool } from "~/editor/edit-mode/tools/select-tool";
import { AppleTool } from "~/editor/edit-mode/tools/apple-tools";
import { KillerTool } from "~/editor/edit-mode/tools/killer-tool";
import { FlowerTool } from "~/editor/edit-mode/tools/flower-tool";
import { AIWidget } from "~/editor/edit-mode/widgets/ai-widget";
import { useLgrAssets } from "~/components/use-lgr-assets";
import {
  editorLevelFromFile,
  getBuiltinLevel,
  getDefaultLevel,
} from "~/editor/helpers/level-parser";
import { PictureTool } from "~/editor/edit-mode/tools/picture-tool";
import { HandTool } from "~/editor/edit-mode/tools/hand-tool";
import { TextureTool } from "~/editor/edit-mode/tools/texture-tool";
import { cn } from "~/utils/misc";
import type { EditorLevel } from "~/editor/elma-types";
import type { EditorDocumentInput } from "~/editor/editor-state";
import type { WorldSceneRendererBackend } from "~/editor/render/world-scene-renderer";
import {
  useCustomDefaultLevelTemplate,
  useDefaultLevelPreset,
} from "~/editor/edit-mode/default-level-preset";

type EditorViewProps = React.ComponentPropsWithRef<"canvas"> & {};

export function EditorView({ className, ...props }: EditorViewProps) {
  return (
    <div className={cn("relative h-full w-full", className)}>
      <canvas
        className="absolute inset-0 h-full w-full touch-none select-none"
        {...props}
      />
    </div>
  );
}

type UseEditorViewOptions = {
  initialDocument?: InitialDocument;
  isOpenAIEnabled?: boolean;
  rendererBackend?: WorldSceneRendererBackend;
};

export function useEditorView({
  initialDocument,
  isOpenAIEnabled,
  rendererBackend = "webgl",
}: UseEditorViewOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EditorEngine | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const lastSizeRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const store = useEditorStore();
  const lgrAssets = useLgrAssets();
  const editorLgrAssets = lgrAssets.lgr;

  useEffect(
    function initializeEditorEngine() {
      const canvas = canvasRef.current;
      if (
        !canvas ||
        engineRef.current ||
        initialDocument?.status === "loading"
      ) {
        return;
      }

      const parent = canvas.parentElement;
      if (!parent) return;

      const applyResize = () => {
        const rect = parent.getBoundingClientRect();
        const width = Math.floor(rect.width);
        const height = Math.floor(rect.height);

        if (
          lastSizeRef.current.width === width &&
          lastSizeRef.current.height === height
        ) {
          return;
        }

        if (engineRef.current) {
          engineRef.current.resize(width, height);
        } else {
          canvas.width = width;
          canvas.height = height;
        }

        lastSizeRef.current = { width, height };
      };

      const scheduleResize = () => {
        if (resizeFrameRef.current !== null) return;
        resizeFrameRef.current = requestAnimationFrame(() => {
          resizeFrameRef.current = null;
          applyResize();
        });
      };

      applyResize();

      const tools = [
        SelectTool,
        HandTool,
        VertexTool,
        UnionTool,
        SubtractTool,
        IntersectTool,
        AppleTool,
        KillerTool,
        FlowerTool,
        PictureTool,
        TextureTool,
      ];

      const widgets = [];
      if (isOpenAIEnabled) {
        widgets.push(AIWidget);
      }

      engineRef.current = new EditorEngine(canvas, {
        store,
        tools,
        widgets,
        lgrAssets: editorLgrAssets ?? undefined,
        initialDocument: initialDocument?.document,
        rendererBackend,
      });

      // Add resize observer to handle parent size changes (batched to avoid flicker)
      const resizeObserver = new ResizeObserver(() => {
        scheduleResize();
      });
      resizeObserver.observe(parent);
      resizeObserverRef.current = resizeObserver;
    },
    [
      store,
      initialDocument?.document,
      initialDocument?.status,
      isOpenAIEnabled,
      editorLgrAssets,
      rendererBackend,
    ],
  );

  useEffect(function cleanupEditorEngineOnUnmount() {
    return () => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []);

  useEffect(
    function syncEditorEngineLgrAssets() {
      if (!engineRef.current || !editorLgrAssets) return;
      engineRef.current.setLgrAssets(editorLgrAssets);
    },
    [editorLgrAssets],
  );

  return { canvasRef, engineRef };
}

type InitialDocument = {
  document: EditorDocumentInput | undefined;
  status: "loading" | "done" | "error";
};

// TODO: should this move to FileSession or EditorStore?
export function useInitialLevel(levelName?: string): InitialDocument {
  const [data, setData] = useState<EditorLevel | undefined>(undefined);
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const store = useEditorStore();
  const defaultLevelPreset = useDefaultLevelPreset();
  const customDefaultLevelTemplate = useCustomDefaultLevelTemplate();
  const [initialDefaultLevelTitle] = useState(
    () => store.getState().defaultLevelTitle || DEFAULT_LEVEL_TITLE,
  );
  const [initialDefaultLevelPreset] = useState(defaultLevelPreset);
  const [initialCustomDefaultLevelTemplate] = useState(
    customDefaultLevelTemplate,
  );

  useEffect(
    function loadInitialLevel() {
      let isCanceled = false;

      async function loadInitialLevelDocument() {
        try {
          if (levelName) {
            const level = await getBuiltinLevel(`${levelName}.lev`);
            if (isCanceled) return;

            setData(level ?? undefined);
            setFileName(undefined);
            setStatus(level ? "done" : "error");
            return;
          }

          const openResult = await store.getState().fileSession.openLast();
          if (!openResult) {
            if (isCanceled) return;

            setData(undefined);
            setFileName(undefined);
            setStatus("done");
            return;
          }

          const nextFileName = openResult.fileName.endsWith(".lev")
            ? openResult.fileName
            : `${openResult.fileName}.lev`;
          const file = new File(
            [new Uint8Array(openResult.contents)],
            nextFileName,
          );
          const level = await editorLevelFromFile(file);
          if (isCanceled) return;

          setData(level);
          setFileName(nextFileName);
          setStatus("done");
        } catch (error) {
          console.error("Error loading initial level:", error);
          if (isCanceled) return;

          if (!levelName) store.getState().fileSession.clear();
          setData(undefined);
          setFileName(undefined);
          setStatus(levelName ? "error" : "done");
        }
      }

      void loadInitialLevelDocument();

      return function cancelInitialLevelLoad() {
        isCanceled = true;
      };
    },
    [levelName, store],
  );

  const document = React.useMemo<EditorDocumentInput | undefined>(() => {
    if (status === "loading") return undefined;

    if (!levelName && data && fileName) {
      return {
        level: data,
        origin: { kind: "file", label: "File", canOverwrite: true },
        displayName: fileName,
        hasExternalHandle: true,
      };
    }

    if (!levelName || !data) {
      return {
        level: getDefaultLevel(
          initialDefaultLevelPreset,
          initialCustomDefaultLevelTemplate,
          initialDefaultLevelTitle,
        ),
        origin: {
          kind: "default",
          label: initialDefaultLevelTitle,
          canOverwrite: false,
        },
        displayName: initialDefaultLevelTitle,
        hasExternalHandle: false,
      };
    }

    return {
      level: data,
      origin: { kind: "builtin", label: "Built-in level", canOverwrite: false },
      displayName: data.levelName || levelName,
      hasExternalHandle: false,
    };
  }, [
    data,
    fileName,
    initialCustomDefaultLevelTemplate,
    initialDefaultLevelPreset,
    initialDefaultLevelTitle,
    levelName,
    status,
  ]);

  return React.useMemo(() => ({ document, status }), [document, status]);
}
