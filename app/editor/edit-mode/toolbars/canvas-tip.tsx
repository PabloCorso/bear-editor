import { cn } from "~/utils/misc";
import { Button, type ButtonProps } from "~/components/ui/button";

const keyClassName =
  "inline-flex h-5 shrink-0 items-center justify-center rounded border border-separator px-1.5 py-0 font-sans text-[11px] font-bold text-secondary";

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
