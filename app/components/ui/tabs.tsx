import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import * as React from "react";
import { cn } from "~/utils/misc";

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-2 rounded-lg bg-primary p-1",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Tab>) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "inline-flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded-md px-2 py-1 text-sm font-bold transition-colors select-none focus-visible:focus-ring sm:px-3 sm:text-lg",
        "hover:bg-screen/80",
        "data-[active]:text-on-color data-[active]:bg-screen data-[active]:shadow-sm",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Panel>) {
  return (
    <TabsPrimitive.Panel
      className={cn("focus-visible:focus-ring", className)}
      {...props}
    />
  );
}
