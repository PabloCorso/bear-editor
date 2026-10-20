import { ToolbarButton } from "~/components/ui/toolbar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type TooltipContentProps,
} from "~/components/ui/tooltip";
import { Button, type ButtonProps } from "~/components/ui/button";
import { cn } from "~/utils/misc";

export type ToolButtonProps = ButtonProps & {
  name?: string;
  shortcut?: string;
  tooltipSide?: TooltipContentProps["side"];
  isLoading?: boolean;
  showLabel?: boolean;
  label?: string;
};

export function ToolButton({
  name,
  shortcut,
  tooltipSide,
  isLoading,
  showLabel = false,
  label,
  children,
  className,
  ...props
}: ToolButtonProps) {
  if (showLabel) {
    return (
      <Button
        type="button"
        aria-label={`${name}${shortcut ? ` (${shortcut})` : ""}`}
        iconBefore={children}
        iconSize="lg"
        className={cn(
          "w-full justify-start gap-3 pr-2 pl-1 text-left whitespace-nowrap",
          isLoading && "animate-pulse bg-primary",
          className,
        )}
        {...props}
      >
        <span className="flex-1">{label ?? name}</span>
        {shortcut && (
          <span
            aria-hidden="true"
            className="text-[0.65rem] font-normal text-secondary"
          >
            {shortcut}
          </span>
        )}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger>
        <ToolbarButton
          aria-label={`${name}${shortcut ? ` (${shortcut})` : ""}`}
          isLoading={isLoading}
          className={className}
          {...props}
        >
          {children}
        </ToolbarButton>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide} className="flex items-center gap-2">
        {name}
        {shortcut && <span className="text-secondary">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
