import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "~/utils/misc";

export function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border border-default bg-primary p-0.5 transition-colors focus-visible:focus-ring data-checked:bg-blue-500 data-disabled:pointer-events-none data-disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="size-2.5 rounded-full bg-white shadow-sm transition-transform data-checked:translate-x-3 motion-reduce:transition-none" />
    </SwitchPrimitive.Root>
  );
}
