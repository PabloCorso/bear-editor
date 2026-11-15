import { CursorIcon, PaintBucketIcon } from "@phosphor-icons/react";
import { PickerOptionButton } from "./picker-option-button";

export function MaterialModeButtons({
  fillMode,
  onChange,
}: {
  fillMode: boolean;
  onChange: (fillMode: boolean) => void;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      role="group"
      aria-label="Mode"
    >
      <PickerOptionButton
        label="Place"
        selected={!fillMode}
        onClick={() => onChange(false)}
      >
        <CursorIcon aria-hidden="true" />
      </PickerOptionButton>
      <PickerOptionButton
        label="Fill"
        selected={fillMode}
        onClick={() => onChange(true)}
      >
        <PaintBucketIcon aria-hidden="true" />
      </PickerOptionButton>
    </div>
  );
}
