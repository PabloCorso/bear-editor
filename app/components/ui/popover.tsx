import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import * as React from "react";
import { cn } from "~/utils/misc";

export type PopoverProps = React.ComponentProps<typeof PopoverPrimitive.Root>;

export function Popover({ ...props }: PopoverProps) {
  return <PopoverPrimitive.Root {...props} />;
}

export type PopoverTriggerProps = Omit<
  React.ComponentProps<typeof PopoverPrimitive.Trigger>,
  "children" | "render"
> & { children: React.ReactElement };

export function PopoverTrigger({ ...props }: PopoverTriggerProps) {
  const { children, ...triggerProps } = props;
  return <PopoverPrimitive.Trigger render={children} {...triggerProps} />;
}

export type PopoverCloseProps = Omit<
  React.ComponentProps<typeof PopoverPrimitive.Close>,
  "children" | "render"
> & { children: React.ReactElement };

export function PopoverClose(props: PopoverCloseProps) {
  const { children, ...closeProps } = props;
  return <PopoverPrimitive.Close render={children} {...closeProps} />;
}

export type PopoverContentProps = Omit<
  React.ComponentProps<typeof PopoverPrimitive.Positioner>,
  "children" | "className"
> &
  Omit<
    React.ComponentProps<typeof PopoverPrimitive.Popup>,
    "children" | "className"
  > & {
    children?: React.ReactNode;
    className?: string;
    positionerClassName?: string;
  };

export function PopoverContent({
  className,
  positionerClassName,
  align = "center",
  sideOffset = 12,
  initialFocus,
  finalFocus,
  children,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        className={cn("z-40", positionerClassName)}
        sideOffset={sideOffset}
        {...props}
      >
        <PopoverPrimitive.Popup
          className={cn("z-40", className)}
          initialFocus={initialFocus}
          finalFocus={finalFocus}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export type PopoverArrowProps = React.ComponentProps<
  typeof PopoverPrimitive.Arrow
>;

export function PopoverArrow({ className, ...props }: PopoverArrowProps) {
  return (
    <PopoverPrimitive.Arrow
      className={cn(
        "fill-[var(--background-screen)]/80 stroke-[var(--border-default)]",
        className,
      )}
      {...props}
    />
  );
}

export type PopoverAnchorProps = { children: React.ReactElement };

export function PopoverAnchor({ children }: PopoverAnchorProps) {
  return children;
}
