import type {
  PopoverContentProps,
  PopoverProps,
  PopoverTriggerProps,
} from "~/components/ui/popover";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Toolbar, type ToolbarProps } from "~/components/ui/toolbar";
import { cn } from "~/utils/misc";

export function FloatingToolbar({ modal = false, ...props }: PopoverProps) {
  return <Popover modal={modal} {...props} />;
}

export function FloatingToolbarAnchor({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <PopoverAnchor>
      <div className={cn("inline-flex", className)} {...props} />
    </PopoverAnchor>
  );
}

export function FloatingToolbarTrigger(props: PopoverTriggerProps) {
  return <PopoverTrigger {...props} />;
}

export function FloatingToolbarContent({
  className,
  sideOffset = 12,
  collisionPadding = 16,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverContent
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        "z-40 max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] overflow-auto outline-hidden",
        className,
      )}
      {...props}
    />
  );
}

export function FloatingToolbarPanel({ className, ...props }: ToolbarProps) {
  return <Toolbar className={cn("shadow-lg", className)} {...props} />;
}
