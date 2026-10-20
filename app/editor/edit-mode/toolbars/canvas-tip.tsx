import { cn } from "~/utils/misc";

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
