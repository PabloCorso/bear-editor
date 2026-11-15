import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { cn } from "~/utils/misc";

export function MaterialModeButtons({
  toolLabel,
  fillMode,
  onChange,
}: {
  toolLabel: string;
  fillMode: boolean;
  onChange: (fillMode: boolean) => void;
}) {
  const buttonClass =
    "relative rounded-md px-2 text-xs font-medium whitespace-nowrap text-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-[-2px] aria-pressed:text-primary";

  return (
    <ToggleGroup
      aria-label={`${toolLabel} mode`}
      value={[fillMode ? "fill" : "place"]}
      onValueChange={([mode]) => {
        if (mode) onChange(mode === "fill");
      }}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") event.stopPropagation();
      }}
      className="relative grid h-8 shrink-0 grid-cols-2 rounded-lg bg-primary/40 p-0.5"
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-md bg-primary-hover/70 motion-safe:transition-transform motion-safe:duration-150",
          fillMode && "translate-x-full",
        )}
      />
      <Toggle value="place" className={buttonClass}>
        {toolLabel}
      </Toggle>
      <Toggle value="fill" className={buttonClass}>
        Fill
      </Toggle>
    </ToggleGroup>
  );
}
