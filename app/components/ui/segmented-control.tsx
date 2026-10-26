import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { cn } from "~/utils/misc";

export function SegmentedControl<Value>({
  className,
  ...props
}: RadioGroup.Props<Value>) {
  return (
    <RadioGroup
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md bg-primary p-0.5",
        className,
      )}
      {...props}
    />
  );
}

export function SegmentedControlItem<Value>({
  className,
  ...props
}: Radio.Root.Props<Value>) {
  return (
    <Radio.Root
      nativeButton
      render={<button type="button" />}
      className={cn(
        "inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded px-1.5 py-1 text-[10px] leading-3 text-secondary transition-colors select-none hover:text-primary focus-visible:focus-ring data-checked:bg-screen data-checked:text-primary data-checked:shadow-sm data-disabled:pointer-events-none data-disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
