import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr";
import type * as React from "react";
import { cn } from "~/utils/misc";

export const Collapsible = CollapsiblePrimitive.Root;

export function CollapsibleTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
  return (
    <CollapsiblePrimitive.Trigger
      className={cn(
        "group/collapsible cursor-pointer text-left focus-visible:focus-ring",
        className,
      )}
      {...props}
    >
      {children}
      <CaretRightIcon
        aria-hidden
        className="size-4 shrink-0 transition-transform group-aria-expanded/collapsible:rotate-90 motion-reduce:transition-none"
      />
    </CollapsiblePrimitive.Trigger>
  );
}

export function CollapsiblePanel({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Panel>) {
  return (
    <CollapsiblePrimitive.Panel
      hiddenUntilFound
      className={cn("overflow-hidden", className)}
      {...props}
    />
  );
}
