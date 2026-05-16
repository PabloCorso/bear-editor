import { createContext, useContext, useRef } from "react";
import { useStore as useZustand } from "zustand";
import { createEditorStore, type EditorStore } from "./editor-store";
import type { Tool, ToolState } from "./edit-mode/tools/tool-interface";
import type { EditorDocumentSession, EditorState } from "./editor-state";
import type { ToolMeta } from "./edit-mode/tools/default-tools";
import {
  loadEditorPreferences,
  useEditorPreferencesSync,
} from "./editor-preferences";

const EditorContext = createContext<EditorStore | null>(null);

export const EditorProvider = ({
  initialToolId = "select",
  children,
}: {
  initialToolId?: string;
  children: React.ReactNode;
}) => {
  const storeRef = useRef<EditorStore>();
  if (!storeRef.current) {
    storeRef.current = createEditorStore({
      initialToolId,
      initialPreferences: loadEditorPreferences(),
    });
  }
  const store = storeRef.current;
  useEditorPreferencesSync(store);

  return (
    <EditorContext.Provider value={store}>{children}</EditorContext.Provider>
  );
};

export function useEditorStore() {
  const store = useContext(EditorContext);
  if (!store) {
    throw new Error("useEditorStore must be used within a <EditorProvider />");
  }
  return store;
}

export function useEditor<T>(selector: (state: EditorState) => T): T {
  const store = useContext(EditorContext);
  if (!store) {
    throw new Error("useEditor must be used within a <EditorProvider />");
  }
  return useZustand(store, selector);
}

export function useEditorHistory() {
  return useEditorStore().temporal.getState();
}

export function useEditorCanUndo() {
  const store = useEditorStore();
  return useZustand(store.temporal, (state) => state.pastStates.length > 0);
}
export function useEditorCanRedo() {
  const store = useEditorStore();
  return useZustand(store.temporal, (state) => state.futureStates.length > 0);
}

export function useLevelName() {
  return useEditor((state) => state.levelName);
}

export function useZoom() {
  return useEditor((state) => state.zoom);
}

export function usePlayModeZoom() {
  return useEditor((state) => state.playModeZoom);
}

export function useEditorDocumentSession(): EditorDocumentSession {
  return useEditor((state) => state.documentSession);
}

export function useEditorIsDirty() {
  return useEditor((state) => state.documentSession.dirty);
}

export function useEditorIsPlayMode() {
  return useEditor((state) => state.isPlayMode);
}

export function useEditorIsUIVisible() {
  return useEditor((state) => state.isUIVisible);
}

export function usePlaySettings() {
  return useEditor((state) => state.playSettings);
}

export function useVertexEdgeClickPreference() {
  return useEditor((state) => state.vertexEdgeClickBehavior);
}

export function useEditorActions() {
  return useEditor((state) => state.actions);
}

export function useEditorActiveTool<T extends Tool>(
  toolId?: string,
): T | undefined {
  return useEditor((state) => state.actions.getActiveTool<T>(toolId));
}

export function useEditorTool<T extends Tool>(toolId: string): T | undefined {
  return useEditor((state) => state.actions.getTool<T>(toolId));
}

export function useEditorToolState<T extends ToolState>(
  toolId: string,
): T | undefined {
  return useEditor((state) => state.actions.getToolState<T>(toolId));
}

export function useEditorRegisteredTools(): ToolMeta[] {
  const store = useEditorStore();
  const previousMetasRef = useRef<ToolMeta[] | null>(null);

  return useZustand(store, (state) => {
    const nextMetas = Array.from(state.toolsMap.values()).map(
      (tool) => tool.meta,
    );
    const previousMetas = previousMetasRef.current;
    if (
      previousMetas &&
      previousMetas.length === nextMetas.length &&
      previousMetas.every((meta, index) => meta === nextMetas[index])
    ) {
      return previousMetas;
    }

    previousMetasRef.current = nextMetas;
    return nextMetas;
  });
}

export function useEditorWidget<T>(widgetId: string): T | undefined {
  return useEditor((state) => state.widgetsMap.get(widgetId) as T | undefined);
}

export function useEditorLevelFolderName() {
  return useEditor((state) =>
    state.levelFolder?.hasFolder() ? state.levelFolder.name : null,
  );
}
