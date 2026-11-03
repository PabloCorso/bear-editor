import { TextTIcon } from "@phosphor-icons/react/dist/ssr";
import { ToolControlButton, type ToolControlButtonProps } from "./tool";
import { defaultTools } from "../tools/default-tools";

export function TextToolControl(props: ToolControlButtonProps) {
  return (
    <ToolControlButton {...defaultTools.text} {...props}>
      <TextTIcon />
    </ToolControlButton>
  );
}
