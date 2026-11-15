import { ToolbarButton } from "~/components/ui/toolbar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/utils/misc";

export function PickerOptionButton({
  label,
  selected,
  disabled,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <ToolbarButton
          size="sm"
          aria-label={label}
          aria-pressed={selected}
          className={cn("relative shrink-0", selected && "bg-primary-hover/50")}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </ToolbarButton>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
