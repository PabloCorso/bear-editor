import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "~/utils/misc";

type CheckboxProps = Omit<
  React.ComponentProps<typeof CheckboxPrimitive.Root>,
  "children" | "className"
> & {
  accentColor?: string;
  children?: React.ReactNode;
  className?: string;
  indicatorClassName?: string;
  visualChecked?: boolean;
};

type CheckboxStyle = React.CSSProperties & {
  "--checkbox-accent"?: string;
};

export function Checkbox({
  accentColor = "var(--primary)",
  children,
  className,
  indicatorClassName,
  visualChecked,
  style,
  ...props
}: CheckboxProps) {
  const isVisuallyChecked = visualChecked ?? props.checked;
  const checkboxStyle: CheckboxStyle = {
    "--checkbox-accent": accentColor,
    ...style,
  };

  return (
    <CheckboxPrimitive.Root
      className={cn(
        "group inline-flex cursor-pointer items-center gap-2 rounded-xs text-sm outline-hidden transition-colors select-none focus-visible:focus-ring",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      data-visual-checked={isVisuallyChecked ? "" : undefined}
      style={checkboxStyle}
      {...props}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-500 bg-transparent text-white transition-colors",
          "group-hover:border-slate-300",
          "group-data-[visual-checked]:border-[var(--checkbox-accent)] group-data-[visual-checked]:bg-[var(--checkbox-accent)]",
          "group-data-[disabled]:group-hover:border-slate-500",
          indicatorClassName,
        )}
        aria-hidden="true"
      >
        <CheckboxPrimitive.Indicator
          keepMounted
          className="flex opacity-0 transition-opacity group-data-[visual-checked]:opacity-100"
        >
          <CheckIcon weight="bold" className="h-3 w-3" />
        </CheckboxPrimitive.Indicator>
      </span>
      {children}
    </CheckboxPrimitive.Root>
  );
}
