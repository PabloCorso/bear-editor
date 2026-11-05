import { useEffect, useRef } from "react";
import { useEditorDocumentGuard } from "~/editor/session/document-guard";
import { useEditorStore } from "~/editor/use-editor-store";
import { getLevelSnapshot } from "~/editor/editor-store";
import {
  parseLevelJson,
  serializeLevelJson,
} from "~/editor/helpers/level-json";
import { screenToWorld } from "~/editor/helpers/coordinate-helpers";
import type { Position } from "~/editor/elma-types";
import type { SelectTool } from "../tools/select-tool";

export function useJsonFileActions({ disabled }: { disabled?: boolean }) {
  const store = useEditorStore();
  const input = useRef<HTMLInputElement>(null);
  const { confirmDiscardChanges } = useEditorDocumentGuard();
  const busy = useRef(false);

  const importFile = async (file: File, dropPosition?: Position) => {
    if (busy.current || store.getState().documentSession.saveState === "saving")
      return;
    busy.current = true;
    const sessionId = store.getState().documentSession.clipboardSessionId;
    try {
      const source = await file.text();
      const parsed = parseLevelJson(source);
      if (store.getState().documentSession.clipboardSessionId !== sessionId)
        return;
      if (parsed.kind === "level") {
        if (!(await confirmDiscardChanges())) return;
        if (store.getState().documentSession.clipboardSessionId !== sessionId)
          return;
        const state = store.getState();
        state.actions.getActiveTool()?.clear?.();
        await state.fileSession.clear();
        state.actions.replaceDocument({
          level: parsed.data,
          origin: { kind: "file", label: "JSON import", canOverwrite: false },
          displayName: file.name,
          hasExternalHandle: false,
        });
        state.actions.triggerFitToView();
      } else {
        const state = store.getState();
        state.actions.activateTool("select");
        const canvas = document.querySelector("canvas");
        const anchor = screenToWorld(
          dropPosition ?? {
            x: (canvas?.clientWidth ?? 0) / 2,
            y: (canvas?.clientHeight ?? 0) / 2,
          },
          state.viewPortOffset,
          state.zoom,
        );
        state.actions
          .getTool<SelectTool>("select")
          ?.importJsonSelection(parsed.data, anchor);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not import JSON.");
    } finally {
      busy.current = false;
    }
  };

  // Drop only on the editor canvas; leave other file inputs and dialogs alone.
  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (
        event.target instanceof HTMLCanvasElement &&
        event.dataTransfer?.types.includes("Files")
      )
        event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!(event.target instanceof HTMLCanvasElement)) return;
      const file = event.dataTransfer?.files[0];
      if (!file?.name.toLowerCase().endsWith(".json")) return;
      event.preventDefault();
      const bounds = event.target.getBoundingClientRect();
      if (!disabled)
        void importFile(file, {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        });
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  });

  const exportJson = () => {
    const level = getLevelSnapshot(store.getState());
    const url = URL.createObjectURL(
      new Blob([serializeLevelJson(level)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${level.levelName || "Untitled"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return {
    importJson: () => input.current?.click(),
    exportJson,
    input: (
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void importFile(file);
        }}
      />
    ),
  };
}
