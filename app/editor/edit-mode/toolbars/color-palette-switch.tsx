import { Switch } from "~/components/ui/switch";

export function ColorPaletteSwitch({
  count,
  checked,
  onCheckedChange,
}: {
  count: number;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[10px] text-secondary">
      <Switch
        aria-label={`Show all ${count} colors`}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
      <span aria-hidden="true" className="whitespace-nowrap">
        All {count}
      </span>
    </label>
  );
}
