import { CursorIcon } from "@phosphor-icons/react/dist/ssr";
import { ToolControlButton, type ToolControlButtonProps } from "./tool";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";

export function SelectToolControl(props: ToolControlButtonProps) {
  return (
    <ToolControlButton {...defaultTools.select} {...props}>
      <CursorIcon weight="light" />
    </ToolControlButton>
  );
}
