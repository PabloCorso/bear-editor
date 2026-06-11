import {
  useEditorActions,
  useEditorCanRedo,
  useEditorCanUndo,
  useEditorHistory,
  useEditorToolState,
} from "~/editor/use-editor-store";
import { Toolbar, type ToolbarProps } from "~/components/ui/toolbar";
import {
  ArrowArcLeftIcon,
  ArrowArcRightIcon,
  CornersOutIcon,
  MinusIcon,
  PlusIcon,
  QuestionIcon,
  KeyboardIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { EditorEngine } from "~/editor/edit-mode/engine/editor-engine";
import { ToolButton, type ToolButtonProps } from "./tool";
import { cn, useModifier } from "~/utils/misc";
import type { VertexToolState } from "~/editor/edit-mode/tools/vertex-tool";
import { useEffect, useState } from "react";
import { ToolbarButton } from "~/components/ui/toolbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog";
import { isUserTyping } from "~/editor/helpers/event-handler";
import { OPEN_KEYBOARD_SHORTCUTS_SHORTCUT } from "./keyboard-shortcuts";

type CanvasToolbarProps = ToolbarProps & {
  engineRef: React.RefObject<EditorEngine | null>;
};

export function CanvasToolbar({
  className,
  engineRef,
  ...props
}: CanvasToolbarProps) {
  const { triggerFitToView } = useEditorActions();
  const modifier = useModifier();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(function handleKeyboardShortcutsListener() {
    const controller = new AbortController();

    window.addEventListener(
      "keydown",
      (event: KeyboardEvent) => {
        if (event.key !== OPEN_KEYBOARD_SHORTCUTS_SHORTCUT) return;
        if (isUserTyping()) return;

        event.preventDefault();
        setShortcutsOpen(true);
      },
      { signal: controller.signal },
    );

    return function cleanupKeyboardShortcutsListener() {
      controller.abort();
    };
  }, []);

  return (
    <>
      <div
        className={cn(
          "absolute right-4 bottom-4 flex items-center gap-2",
          className,
        )}
        {...props}
      >
        <Toolbar className="w-fit gap-2">
          <UndoToolButton engineRef={engineRef} />
          <RedoToolButton engineRef={engineRef} />
        </Toolbar>
        <Toolbar className="w-fit gap-2">
          <ToolButton
            name="Zoom In"
            shortcut="+"
            onClick={() => engineRef.current?.zoomIn()}
          >
            <PlusIcon />
          </ToolButton>
          <ToolButton
            name="Zoom Out"
            shortcut="-"
            onClick={() => engineRef.current?.zoomOut()}
          >
            <MinusIcon />
          </ToolButton>
          <ToolButton
            name="Fit to view"
            shortcut={`${modifier} + 0`}
            onClick={triggerFitToView}
          >
            <CornersOutIcon />
          </ToolButton>
          <CanvasHelpMenu onOpenShortcuts={() => setShortcutsOpen(true)} />
        </Toolbar>
      </div>

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
    </>
  );
}

function CanvasHelpMenu({ onOpenShortcuts }: { onOpenShortcuts: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <ToolbarButton aria-label="Help">
          <QuestionIcon />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        <DropdownMenuItem
          iconBefore={<KeyboardIcon />}
          shortcut={OPEN_KEYBOARD_SHORTCUTS_SHORTCUT}
          onClick={onOpenShortcuts}
        >
          Keyboard shortcuts
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UndoToolButton({
  engineRef,
  ...props
}: ToolButtonProps & {
  engineRef: React.RefObject<EditorEngine | null>;
}) {
  const { undo } = useEditorHistory();
  const canUndo = useEditorCanUndo();
  const vertexToolState = useEditorToolState<VertexToolState>("vertex");
  const hasPendingVertexEdit = Boolean(
    vertexToolState?.editingPolygon &&
    vertexToolState.drawingPolygon.vertices.length > 0,
  );
  const modifier = useModifier();
  return (
    <ToolButton
      id="undo"
      name="Undo"
      shortcut={`${modifier} + Z`}
      onClick={() => engineRef.current?.undo() ?? undo()}
      disabled={!canUndo && !hasPendingVertexEdit}
      {...props}
    >
      <ArrowArcLeftIcon />
    </ToolButton>
  );
}

function RedoToolButton({
  engineRef,
  ...props
}: ToolButtonProps & {
  engineRef: React.RefObject<EditorEngine | null>;
}) {
  const { redo } = useEditorHistory();
  const canRedo = useEditorCanRedo();
  const modifier = useModifier();
  return (
    <ToolButton
      id="redo"
      name="Redo"
      shortcut={`${modifier} + Y`}
      onClick={() => engineRef.current?.redo() ?? redo()}
      disabled={!canRedo}
      {...props}
    >
      <ArrowArcRightIcon />
    </ToolButton>
  );
}
