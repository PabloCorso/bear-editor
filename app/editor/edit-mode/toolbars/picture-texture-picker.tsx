import { PictureIcon } from "~/components/sprite-icon";
import { Toolbar } from "~/components/ui/toolbar";
import { Clip } from "~/editor/elma-types";
import { cn } from "~/utils/misc";
import { PicturePropertiesToolbar } from "./picture-properties-toolbar";
import { useToolSelection } from "./tool";

export const pickerColumnClassName = "w-[96px]";
const pickerLabelClassName = "max-w-[96px]";
const PICKER_PREVIEW_MAX_WIDTH_PX = 96;
const PICKER_PREVIEW_MAX_HEIGHT_PX = 86;
const PICKER_PREVIEW_MIN_SIZE_PX = 34;
const TRUE_SIZE_PREVIEW_WEIGHT = 0.3;
const spriteTitles: Record<string, string> = {
  st3top: "Stone 3 top",
  supphred: "Support horizontal",
  suppvred: "Support vertical",
  susp: "Suspension",
  suspdown: "Suspension down",
  suspup: "Suspension up",
};

type PictureTexturePickerItem = {
  key: string;
  label: string;
  secondaryLabel?: string;
  title?: string;
  previewSrc?: string;
  previewClassName?: string;
  width?: number;
  height?: number;
  isSelected: boolean;
  onActivate: () => void;
};

type PickerItemProperties = {
  distance: number;
  clip: Clip;
  defaultDistance: number;
  defaultClip: Clip;
  onDistanceChange: (distance: number) => void;
  onClipChange: (clip: Clip) => void;
  onResetDefaults: () => void;
};

type PickerItem = PictureTexturePickerItem &
  (PickerItemProperties | Partial<Record<keyof PickerItemProperties, never>>);

type PictureTexturePickerProps = {
  items: PickerItem[];
  maxSpriteDimension: number;
  header?: React.ReactNode;
  compact?: boolean;
  placementSettings?: React.ReactNode;
  rowHeaders?: Record<string, React.ReactNode>;
  maxColumns?: 4 | 6;
};

export function PictureTexturePicker({
  items,
  maxSpriteDimension,
  header,
  compact = false,
  placementSettings,
  rowHeaders,
  maxColumns = 6,
}: PictureTexturePickerProps) {
  const onSelect = useToolSelection();

  function renderGrid(gridItems: PickerItem[]) {
    return (
      <ul
        className={cn(
          "grid w-full items-stretch gap-x-2",
          compact ? "gap-y-4" : "gap-y-6",
          !compact && !rowHeaders && "picture-picker-grid",
          compact
            ? "grid-cols-3 @min-[280px]:grid-cols-4"
            : "grid-cols-1 @min-[200px]:grid-cols-2 @min-[304px]:grid-cols-3 @min-[408px]:grid-cols-4",
          maxColumns === 6 &&
            (compact
              ? "@min-[400px]:grid-cols-6"
              : "@min-[512px]:grid-cols-5 @min-[616px]:grid-cols-6"),
        )}
      >
        {gridItems.map((item) => (
          <li
            key={item.key}
            ref={item.isSelected ? scrollSelectedPickerItemIntoView : undefined}
            className="flex min-w-0 flex-col items-center gap-1"
          >
            <button
              className={cn(
                "group flex cursor-pointer flex-col items-center rounded hover:bg-primary-hover/50 hover:text-primary",
                compact ? "w-full gap-1" : `${pickerColumnClassName} pt-1`,
                item.isSelected && "bg-primary-hover/50 text-primary",
              )}
              type="button"
              aria-label={item.title ?? item.label}
              aria-pressed={item.isSelected}
              onClick={() => {
                item.onActivate();
                onSelect?.();
              }}
            >
              <span
                title={item.title}
                className={cn(
                  "flex items-baseline justify-between gap-1 text-[10px] leading-3",
                  pickerLabelClassName,
                )}
              >
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-left font-medium text-secondary group-hover:text-primary",
                    item.isSelected && "text-primary",
                  )}
                >
                  {item.label}
                </span>
                {item.secondaryLabel ? (
                  <span
                    className={cn(
                      "shrink-0 text-right text-[9px] font-normal text-secondary/70 group-hover:text-primary/70",
                      item.isSelected && "text-primary/70",
                    )}
                  >
                    {item.secondaryLabel}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "inline-flex items-center justify-center rounded",
                  compact &&
                    (maxColumns === 6
                      ? "aspect-square w-full max-w-12"
                      : "aspect-square w-full max-w-16"),
                  !compact && "h-[86px] w-[96px]",
                )}
              >
                <span
                  className="inline-flex items-center justify-center"
                  style={
                    compact
                      ? { width: "100%", height: "100%" }
                      : getPreviewFrameStyle({
                          width: item.width,
                          height: item.height,
                          maxSpriteDimension,
                        })
                  }
                >
                  <PictureIcon
                    className={item.previewClassName ?? "h-full w-full"}
                    src={item.previewSrc}
                  />
                </span>
              </span>
            </button>
            {item.distance !== undefined && item.clip !== undefined && (
              <div className="max-w-full">
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
            )}
          </li>
        ))}
      </ul>
    );
  }

  const groups: {
    key: string;
    header: React.ReactNode;
    items: PickerItem[];
  }[] = [];
  if (rowHeaders) {
    for (const item of items) {
      if (rowHeaders[item.key])
        groups.push({ key: item.key, header: rowHeaders[item.key], items: [] });
      groups.at(-1)?.items.push(item);
    }
  }

  return (
    <Toolbar
      orientation="vertical"
      className={cn(
        "pointer-events-auto max-h-[calc(100dvh-var(--toolbar-space)-1rem)] min-h-0 overflow-hidden p-0",
        "max-w-[calc(100vw-6rem)]",
        !compact && maxColumns === 6 ? "w-[640px]" : "w-[432px]",
      )}
    >
      <div className="@container min-h-0 w-full overflow-x-hidden overflow-y-auto p-2 [scrollbar-width:thin]">
        {(placementSettings || header) && (
          <div className="mb-3 flex w-full flex-wrap items-center gap-x-2 gap-y-2">
            {header}
            {placementSettings && (
              <div className="ml-auto">{placementSettings}</div>
            )}
          </div>
        )}
        {rowHeaders ? (
          <div className="flex flex-col gap-3">
            {groups.map((group, index) => (
              <section key={group.key} className="flex flex-col gap-3">
                {index > 0 && <div className="h-px bg-separator" />}
                <div className="flex flex-wrap items-center gap-2 pl-1.5">
                  {group.header}
                </div>
                {renderGrid(group.items)}
              </section>
            ))}
          </div>
        ) : (
          renderGrid(items)
        )}
      </div>
    </Toolbar>
  );
}

function scrollSelectedPickerItemIntoView(node: HTMLLIElement | null) {
  if (!node) return;

  node.scrollIntoView({
    block: "center",
    inline: "nearest",
  });
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

export function formatSpriteTitle(name: string) {
  const spriteTitle = spriteTitles[name];
  if (spriteTitle) return spriteTitle;

  const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);

  return capitalizedName.replace(/^([^0-9]+?)([0-9]+)$/, "$1 $2");
}
