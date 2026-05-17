import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import { Menu as DropdownMenuPrimitive } from "@base-ui/react/menu";
import { Icon } from "./icon";
import { cn } from "~/utils/misc";

export const DropdownMenu = DropdownMenuPrimitive.Root;

export function DropdownMenuTrigger({
  children,
  ...props
}: Omit<
  React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>,
  "children" | "render"
> & { children: React.ReactElement }) {
  return <DropdownMenuPrimitive.Trigger render={children} {...props} />;
}

export const DropdownMenuTriggerIcon = CaretDownIcon;

const itemClassName = cn(
  "relative flex items-center gap-1.5 rounded-xs px-2 py-1.5 text-sm outline-hidden transition-colors select-none hover:bg-primary-hover active:bg-primary-active data-disabled:pointer-events-none data-disabled:opacity-50",
);

export function DropdownMenuItem({
  className,
  children,
  iconBefore,
  iconAfter,
  shortcut,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  iconBefore?: React.ReactNode;
  iconAfter?: React.ReactNode;
  shortcut?: React.ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(itemClassName, className)}
      {...props}
    >
      {iconBefore ? <Icon className="opacity-75">{iconBefore}</Icon> : null}
      {children}
      {shortcut ? (
        <span className="ml-auto pl-2 text-xs text-white/45">{shortcut}</span>
      ) : null}
      {iconAfter ? <Icon className="ml-auto">{iconAfter}</Icon> : null}
    </DropdownMenuPrimitive.Item>
  );
}

const contentClassName = cn(
  "max-h-[var(--available-height)] min-w-[8rem] overflow-x-hidden overflow-y-auto overscroll-contain rounded-md border border-default bg-screen p-1 shadow-md",
);
const contentAnimationClassName = cn(
  "data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
);

export function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 4,
  collisionPadding = 8,
  children,
  finalFocus,
  ...props
}: Omit<
  React.ComponentProps<typeof DropdownMenuPrimitive.Positioner>,
  "children" | "className"
> &
  Omit<
    React.ComponentProps<typeof DropdownMenuPrimitive.Popup>,
    "children" | "className"
  > & {
    children?: React.ReactNode;
    className?: string;
  }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Positioner
        className="z-60"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        {...props}
      >
        <DropdownMenuPrimitive.Popup
          finalFocus={finalFocus}
          className={cn(contentClassName, contentAnimationClassName, className)}
        >
          {children}
        </DropdownMenuPrimitive.Popup>
      </DropdownMenuPrimitive.Positioner>
    </DropdownMenuPrimitive.Portal>
  );
}

export const DropdownMenuGroup = DropdownMenuPrimitive.Group;

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.GroupLabel>) {
  return (
    <DropdownMenuPrimitive.GroupLabel
      className={cn("px-2 py-0.5 text-sm font-semibold", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-[var(--border-separator)]", className)}
      {...props}
    />
  );
}
