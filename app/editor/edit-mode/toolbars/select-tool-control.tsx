import {
  CursorIcon,
  LassoIcon,
  SelectionIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  ToolControlButton,
  ToolControlMenu,
  type ToolControlButtonProps,
} from "./tool";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import {
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import {
  SelectTool,
  type SelectToolState,
} from "~/editor/edit-mode/tools/select-tool";
import { Toolbar } from "~/components/ui/toolbar";

export function SelectToolControl(props: ToolControlButtonProps) {
  const select = useEditorToolState<SelectToolState>("select");
  const { getTool } = useEditorActions();
  return (
    <ToolControlMenu
      id="select"
      button={
        <ToolControlButton {...defaultTools.select} {...props}>
          {select?.variant === "lasso" ? (
            <LassoIcon weight="light" />
          ) : (
            <CursorIcon weight="light" />
          )}
        </ToolControlButton>
      }
    >
      <Toolbar orientation="vertical" className="w-max items-stretch">
        <ToolControlButton
          id="select"
          name="Marquee"
          showLabel
          size="sm"
          tooltipSide="right"
          isActive={select?.variant !== "lasso"}
          onClick={() => getTool<SelectTool>("select")?.onActivate("marquee")}
        >
          <SelectionIcon weight="light" />
        </ToolControlButton>
        <ToolControlButton
          id="select"
          name="Lasso"
          showLabel
          size="sm"
          tooltipSide="right"
          isActive={select?.variant === "lasso"}
          onClick={() => getTool<SelectTool>("select")?.onActivate("lasso")}
        >
          <LassoIcon weight="light" />
        </ToolControlButton>
      </Toolbar>
    </ToolControlMenu>
  );
}
