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
} from "@phosphor-icons/react/dist/ssr";
import type { EditorEngine } from "~/editor/edit-mode/engine/editor-engine";
import { ToolButton, type ToolButtonProps } from "./tool";
import { cn, useModifier } from "~/utils/misc";
import type { VertexToolState } from "~/editor/edit-mode/tools/vertex-tool";

type CanvasToolbarProps = ToolbarProps & {
  engineRef: React.RefObject<EditorEngine | null>;
};

export function CanvasToolbar({
  className,
  engineRef,
  ...props
}: CanvasToolbarProps) {
  const { triggerFitToView } = useEditorActions();
  return (
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
        <ToolButton name="Fit to view" shortcut="1" onClick={triggerFitToView}>
          <CornersOutIcon />
        </ToolButton>
      </Toolbar>
    </div>
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
