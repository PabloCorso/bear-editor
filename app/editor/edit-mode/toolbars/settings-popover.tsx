import {
  ArrowCounterClockwiseIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { IconButton } from "~/components/ui/button";
import {
  PopoverClose,
  PopoverContent,
  type PopoverContentProps,
} from "~/components/ui/popover";
import { Toolbar, type ToolbarProps } from "~/components/ui/toolbar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/utils/misc";

type SettingsPopoverContentProps = PopoverContentProps & {
  title: string;
  closeLabel: string;
  resetLabel?: string;
  isDefault?: boolean;
  onReset?: React.MouseEventHandler<HTMLButtonElement>;
};

export function SettingsPopoverContent({
  title,
  closeLabel,
  resetLabel = "Reset defaults",
  isDefault,
  onReset,
  className,
  children,
  ...props
}: SettingsPopoverContentProps) {
  return (
    <PopoverContent
      side="right"
      align="center"
      sideOffset={8}
      collisionPadding={16}
      positionerClassName="z-60"
      className={cn(
        "relative z-50 rounded-lg border border-default bg-screen p-2 pl-3 shadow-xl outline-hidden",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
      {...props}
    >
      <div className="flex items-center gap-2 pb-3">
        <p className="flex-1 text-xs font-bold text-primary">{title}</p>
        {onReset && (
          <Tooltip>
            <TooltipTrigger>
              <IconButton
                type="button"
                size="sm"
                iconSize="sm"
                className="h-5 w-5 text-secondary hover:text-primary"
                aria-label={resetLabel}
                disabled={isDefault}
                onClick={onReset}
              >
                <ArrowCounterClockwiseIcon aria-hidden="true" />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="top">Reset defaults</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger>
            <PopoverClose>
              <IconButton
                type="button"
                size="sm"
                iconSize="sm"
                className="h-5 w-5 text-secondary hover:text-primary"
                aria-label={closeLabel}
              >
                <XIcon aria-hidden="true" />
              </IconButton>
            </PopoverClose>
          </TooltipTrigger>
          <TooltipContent side="top">Close</TooltipContent>
        </Tooltip>
      </div>
      {children}
    </PopoverContent>
  );
}

export function SettingsPopoverFields({ className, ...props }: ToolbarProps) {
  return (
    <Toolbar
      orientation="vertical"
      className={cn(
        "grid min-w-44 grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-2 rounded-md border-0 bg-transparent p-0 shadow-none",
        className,
      )}
      {...props}
    />
  );
}
