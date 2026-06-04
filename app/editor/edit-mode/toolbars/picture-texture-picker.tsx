import { Fragment } from "react";
import { PictureIcon } from "~/components/sprite-icon";
import { Toolbar } from "~/components/ui/toolbar";
import { Clip } from "~/editor/elma-types";
import { cn } from "~/utils/misc";
import { PicturePropertiesToolbar } from "./picture-properties-toolbar";

export const pickerColumnClassName = "w-[96px]";
const pickerLabelClassName = "max-w-[96px]";
const PICKER_PREVIEW_MAX_WIDTH_PX = 96;
const PICKER_PREVIEW_MAX_HEIGHT_PX = 86;
const PICKER_PREVIEW_MIN_SIZE_PX = 34;
const TRUE_SIZE_PREVIEW_WEIGHT = 0.3;

type PictureTexturePickerItem = {
  key: string;
  label: string;
  previewSrc?: string;
  previewClassName?: string;
  width?: number;
  height?: number;
  distance: number;
  clip: Clip;
  defaultDistance: number;
  defaultClip: Clip;
  isSelected: boolean;
  onActivate: () => void;
  onDistanceChange: (distance: number) => void;
  onClipChange: (clip: Clip) => void;
  onResetDefaults: () => void;
};

type PictureTexturePickerProps = {
  items: PictureTexturePickerItem[];
  maxSpriteDimension: number;
};

export function PictureTexturePicker({
  items,
  maxSpriteDimension,
}: PictureTexturePickerProps) {
  return (
    <div className="pointer-events-auto max-h-full overflow-y-auto">
      <Toolbar orientation="vertical" className="gap-0 p-1">
        <ul className="flex w-full flex-col items-stretch">
          {items.map((item, index) => (
            <Fragment key={item.key}>
              <li className="flex flex-col items-center py-2">
                <button
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1 rounded py-1",
                    pickerColumnClassName,
                    item.isSelected && "bg-primary-hover/50 text-primary",
                  )}
                  type="button"
                  aria-pressed={item.isSelected}
                  onClick={item.onActivate}
                >
                  <span
                    className={cn(
                      "block truncate text-center text-[10px] leading-3 font-medium text-secondary",
                      pickerLabelClassName,
                      item.isSelected && "text-primary",
                    )}
                  >
                    {item.label}
                  </span>
                  <span
                    className="inline-flex items-center justify-center rounded"
                    style={getPreviewFrameStyle({
                      width: item.width,
                      height: item.height,
                      maxSpriteDimension,
                    })}
                  >
                    <PictureIcon
                      className={item.previewClassName ?? "h-full w-full"}
                      src={item.previewSrc}
                    />
                  </span>
                </button>
                <div className="mt-1 max-w-full">
                  <PicturePropertiesToolbar
                    variant="summary-popover"
                    className={pickerColumnClassName}
                    distance={item.distance}
                    clip={item.clip}
                    defaultDistance={item.defaultDistance}
                    defaultClip={item.defaultClip}
                    isSelected={item.isSelected}
                    onActivate={item.onActivate}
                    onDistanceChange={item.onDistanceChange}
                    onClipChange={item.onClipChange}
                    onResetDefaults={item.onResetDefaults}
                  />
                </div>
              </li>
              {index < items.length - 1 ? <PickerSeparator /> : null}
            </Fragment>
          ))}
        </ul>
      </Toolbar>
    </div>
  );
}

function PickerSeparator() {
  return (
    <li aria-hidden="true" className="w-full px-1.5">
      <div className="h-px bg-separator" />
    </li>
  );
}

function getPreviewFrameStyle({
  width,
  height,
  maxSpriteDimension,
}: {
  width?: number;
  height?: number;
  maxSpriteDimension: number;
}): React.CSSProperties {
  if (!width || !height) {
    return {
      width: PICKER_PREVIEW_MAX_WIDTH_PX,
      height: PICKER_PREVIEW_MAX_HEIGHT_PX,
    };
  }

  const fitScale = Math.min(
    PICKER_PREVIEW_MAX_WIDTH_PX / width,
    PICKER_PREVIEW_MAX_HEIGHT_PX / height,
  );
  const trueSizeScale =
    Math.min(PICKER_PREVIEW_MAX_WIDTH_PX, PICKER_PREVIEW_MAX_HEIGHT_PX) /
    maxSpriteDimension;
  const scale =
    fitScale * (1 - TRUE_SIZE_PREVIEW_WEIGHT) +
    trueSizeScale * TRUE_SIZE_PREVIEW_WEIGHT;

  return {
    width: Math.min(
      PICKER_PREVIEW_MAX_WIDTH_PX,
      Math.max(PICKER_PREVIEW_MIN_SIZE_PX, Math.round(width * scale)),
    ),
    height: Math.min(
      PICKER_PREVIEW_MAX_HEIGHT_PX,
      Math.max(PICKER_PREVIEW_MIN_SIZE_PX, Math.round(height * scale)),
    ),
  };
}

export function capitalizeSpriteName(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
