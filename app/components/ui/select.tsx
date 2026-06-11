import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "~/utils/misc";
import { buttonVariants } from "./button";
import { Icon } from "./icon";

export const Select = SelectPrimitive.Root;

export function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        buttonVariants({ size: "md" }),
        "min-w-36 justify-between text-left font-semibold",
        "data-[placeholder]:text-white/45",
        className,
      )}
      {...props}
    >
      {children}
    </SelectPrimitive.Trigger>
  );
}

export function SelectValue({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return (
    <SelectPrimitive.Value
      className={cn("min-w-0 truncate", className)}
      {...props}
    />
  );
}

export function SelectTriggerIcon({
  className,
  children = <CaretDownIcon />,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Icon>) {
  return (
    <SelectPrimitive.Icon
      className={cn(
        "ml-2 inline-flex shrink-0 items-center opacity-70 transition-transform data-[popup-open]:rotate-180",
        className,
      )}
      {...props}
    >
      <Icon size="sm">{children}</Icon>
    </SelectPrimitive.Icon>
  );
}

export function SelectContent({
  className,
  positionerClassName,
  align = "start",
  sideOffset = 12,
  collisionPadding = 8,
  children,
  ...props
}: Omit<
  React.ComponentProps<typeof SelectPrimitive.Positioner>,
  "children" | "className"
> &
  Omit<
    React.ComponentProps<typeof SelectPrimitive.Popup>,
    "children" | "className"
  > & {
    children?: React.ReactNode;
    className?: string;
    positionerClassName?: string;
  }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        className={cn("z-60", positionerClassName)}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        {...props}
      >
        <SelectPrimitive.Popup
          className={cn(
            "max-h-[var(--available-height)] min-w-[var(--anchor-width)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-md border border-default bg-screen p-1 shadow-md",
            "data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
            className,
          )}
        >
          <SelectPrimitive.ScrollUpArrow className="-mx-1 -mt-1 flex h-6 items-center justify-center bg-screen text-white/60">
            <CaretDownIcon className="rotate-180" />
          </SelectPrimitive.ScrollUpArrow>
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectPrimitive.ScrollDownArrow className="-mx-1 -mb-1 flex h-6 items-center justify-center bg-screen text-white/60">
            <CaretDownIcon />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

export const SelectGroup = SelectPrimitive.Group;

export function SelectGroupLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.GroupLabel>) {
  return (
    <SelectPrimitive.GroupLabel
      className={cn("px-2 py-0.5 text-sm font-semibold", className)}
      {...props}
    />
  );
}

export function SelectItem({
  className,
  children,
  iconBefore,
  iconAfter,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item> & {
  iconBefore?: React.ReactNode;
  iconAfter?: React.ReactNode;
}) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex cursor-pointer items-center gap-1.5 rounded-xs px-2 py-1.5 pr-8 text-sm outline-hidden transition-colors select-none hover:bg-primary-hover active:bg-primary-active data-disabled:pointer-events-none data-disabled:opacity-50 data-[highlighted]:bg-primary-hover data-[selected]:bg-primary-active/70",
        className,
      )}
      {...props}
    >
      {iconBefore ? <Icon className="opacity-75">{iconBefore}</Icon> : null}
      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
        {children}
      </SelectPrimitive.ItemText>
      {iconAfter ? <Icon className="ml-auto">{iconAfter}</Icon> : null}
      <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex items-center text-white/80">
        <Icon size="sm">
          <CheckIcon />
        </Icon>
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
