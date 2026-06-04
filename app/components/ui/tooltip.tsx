import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import * as React from "react";
import { cn } from "~/utils/misc";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;

type TooltipTriggerProps = Omit<
  React.ComponentPropsWithRef<typeof TooltipPrimitive.Trigger>,
  "children" | "render"
> & { children: React.ReactElement };

export function TooltipTrigger(props: TooltipTriggerProps) {
  const { children, ...triggerProps } = props;
  return <TooltipPrimitive.Trigger render={children} {...triggerProps} />;
}

export type TooltipContentProps = Omit<
  React.ComponentProps<typeof TooltipPrimitive.Positioner>,
  "children" | "className"
> &
  Omit<
    React.ComponentProps<typeof TooltipPrimitive.Popup>,
    "children" | "className"
  > & {
    children?: React.ReactNode;
    className?: string;
  };

export function TooltipContent({
  children,
  className,
  sideOffset = 4,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        className="z-[70]"
        sideOffset={sideOffset}
        {...props}
      >
        <TooltipPrimitive.Popup
          className={cn(
            "z-50 overflow-hidden rounded-md border border-default bg-screen px-3 py-1.5 text-sm shadow-md",
            className,
          )}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
