import { InfoIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "~/utils/misc";
import { Button, type ButtonProps } from "~/components/ui/button";

const keyClassName =
  "inline-flex h-5 shrink-0 items-center justify-center rounded border border-separator px-1.5 py-0 font-sans text-[11px] font-bold text-secondary";

// Shared placement keeps tool hints together and clears the canvas toolbar on
// small screens. Individual hints only provide content and interactions.
export function CanvasTips({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute right-4 bottom-16 left-4 z-10 flex flex-col items-start gap-2 sm:right-auto sm:bottom-4",
        className,
      )}
      {...props}
    />
  );
}

// Sections wrap independently so their end caps stay rounded on small screens.
export function CanvasTipSections({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      role="group"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

export function CanvasTipSection({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      role="group"
      className={cn("flex items-center gap-0.5", className)}
      {...props}
    />
  );
}

export function CanvasTipGroup({
  title,
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { title: string }) {
  return (
    <CanvasTipSection className={cn("flex-wrap", className)} {...props}>
      <CanvasTipSegment>
        <InfoIcon aria-hidden className="-ml-1 size-4 shrink-0 text-primary" />
        <span className="text-primary">{title}</span>
      </CanvasTipSegment>
      {children}
    </CanvasTipSection>
  );
}

export function CanvasTipSegment({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <CanvasTip
      className={cn(
        "shrink-0 gap-1.5 rounded-none px-2.5 first:rounded-l-full last:rounded-r-full",
        className,
      )}
      {...props}
    />
  );
}

export function CanvasTipNumberControl({
  label,
  accessibleLabel,
  value,
  min,
  max,
  decreaseKey = "-",
  increaseKey = "+",
  increaseShortcut = "+ or =",
  onAdjust,
}: {
  label: string;
  accessibleLabel: string;
  value: number;
  min: number;
  max: number;
  decreaseKey?: string;
  increaseKey?: string;
  increaseShortcut?: string;
  onAdjust: (delta: number) => void;
}) {
  return (
    <CanvasTipSegment>
      <span className="mr-1 whitespace-nowrap tabular-nums">
        {label}: {value}
      </span>
      <CanvasTipKeyButton
        className="size-5 p-0"
        aria-label={`Decrease ${accessibleLabel}`}
        title={`Decrease ${label.toLowerCase()} (${decreaseKey})`}
        disabled={value <= min}
        onClick={() => onAdjust(-1)}
      >
        {decreaseKey}
      </CanvasTipKeyButton>
      <CanvasTipKeyButton
        className="size-5 p-0"
        aria-label={`Increase ${accessibleLabel}`}
        title={`Increase ${label.toLowerCase()} (${increaseShortcut})`}
        disabled={value >= max}
        onClick={() => onAdjust(1)}
      >
        {increaseKey}
      </CanvasTipKeyButton>
    </CanvasTipSegment>
  );
}

export function CanvasTipKey({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"kbd">) {
  return <kbd className={cn(keyClassName, className)} {...props} />;
}

export function CanvasTipKeyButton({
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <Button
      type="button"
      size="sm"
      className={cn(keyClassName, className)}
      onPointerDown={(event) => event.preventDefault()}
      {...props}
    >
      <kbd className="font-sans">{children}</kbd>
    </Button>
  );
}

export function CanvasTip({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "text-muted pointer-events-auto flex h-7 items-center rounded-full border border-default bg-screen/80 pr-1.5 text-[11px] font-medium shadow-sm backdrop-blur-[1px] sm:text-xs",
        className,
      )}
      {...props}
    />
  );
}
