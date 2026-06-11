import {
  ArrowCounterClockwiseIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button, IconButton } from "~/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Toolbar,
  ToolbarSeparator,
  type ToolbarProps,
} from "~/components/ui/toolbar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { Clip } from "~/editor/elma-types";
import { cn } from "~/utils/misc";

const MIN_DISTANCE = 0;
const MAX_DISTANCE = 999;
const MIXED_VALUE = "mixed";

type PicturePropertyValue = number | typeof MIXED_VALUE;

type PicturePropertiesToolbarProps = Omit<ToolbarProps, "children"> & {
  distance: PicturePropertyValue;
  clip: Clip | typeof MIXED_VALUE;
  defaultDistance?: number;
  defaultClip?: Clip;
  isSelected?: boolean;
  variant?: "inline" | "stacked" | "compact-inline" | "summary-popover";
  onActivate?: () => void;
  onDistanceChange: (distance: number) => void;
  onClipChange: (clip: Clip) => void;
  onResetDefaults?: () => void;
};

export function PicturePropertiesToolbar({
  distance,
  clip,
  defaultDistance,
  defaultClip,
  isSelected = true,
  variant = "inline",
  onActivate,
  onDistanceChange,
  onClipChange,
  onResetDefaults,
  className,
  ...props
}: PicturePropertiesToolbarProps) {
  const normalizedDistance =
    distance === MIXED_VALUE ? MIXED_VALUE : normalizeDistance(distance);
  const normalizedDefaultDistance =
    defaultDistance === undefined
      ? undefined
      : normalizeDistance(defaultDistance);

  if (variant === "compact-inline") {
    return (
      <Toolbar className={cn("gap-0.5 rounded-md p-0", className)} {...props}>
        <DistanceInput
          compact
          distance={normalizedDistance}
          isSelected={isSelected}
          onActivate={onActivate}
          onCommit={onDistanceChange}
        />
        <ClipSelect
          compact
          clip={clip}
          isSelected={isSelected}
          onActivate={onActivate}
          onChange={onClipChange}
        />
      </Toolbar>
    );
  }

  if (variant === "summary-popover") {
    const hasDefaults =
      normalizedDefaultDistance !== undefined && defaultClip !== undefined;
    const distanceLabel = getDistanceLabel(distance);
    const summaryLabel = `${distanceLabel} (${getClipCode(clip)})`;
    const isDefault =
      hasDefaults &&
      normalizedDistance !== MIXED_VALUE &&
      normalizedDistance === normalizedDefaultDistance &&
      clip !== MIXED_VALUE &&
      clip === defaultClip;

    return (
      <Popover modal={false}>
        <PopoverTrigger>
          <button
            type="button"
            className={cn(
              "flex h-8 w-full cursor-pointer items-center justify-center truncate rounded border-0 bg-transparent px-2 text-center text-xs leading-4 outline-hidden hover:bg-primary-hover/50 hover:text-primary focus-visible:focus-ring aria-expanded:bg-primary-hover/50 aria-expanded:text-primary",
              isSelected ? "text-primary" : "text-secondary",
              className,
            )}
            aria-label={`Edit picture properties: distance ${normalizedDistance}, ${getClipLabel(clip)} clipping`}
            onClick={(event) => {
              event.stopPropagation();
              onActivate?.();
            }}
          >
            <span className="w-full truncate text-center tabular-nums">
              {summaryLabel}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="center"
          collisionPadding={16}
          positionerClassName="z-60"
          className="relative z-50 rounded-lg border border-default bg-screen px-2.5 py-2 shadow-xl outline-hidden"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center gap-2 pb-2">
            <p className="flex-1 text-xs font-bold text-primary">
              Picture properties
            </p>
            {onResetDefaults && hasDefaults ? (
              <Tooltip>
                <TooltipTrigger>
                  <IconButton
                    type="button"
                    size="sm"
                    iconSize="sm"
                    className="h-4 w-4 text-secondary hover:text-primary"
                    aria-label="Reset defaults"
                    disabled={isDefault}
                    onClick={(event) => {
                      event.stopPropagation();
                      onActivate?.();
                      onResetDefaults();
                    }}
                  >
                    <ArrowCounterClockwiseIcon aria-hidden="true" />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent side="top" className="z-[70] px-2 py-1 text-xs">
                  Reset defaults
                </TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger>
                <PopoverClose>
                  <IconButton
                    type="button"
                    size="sm"
                    iconSize="sm"
                    className="h-4 w-4 text-secondary hover:text-primary"
                    aria-label="Close picture properties"
                  >
                    <XIcon aria-hidden="true" />
                  </IconButton>
                </PopoverClose>
              </TooltipTrigger>
              <TooltipContent side="top" className="z-[70] px-2 py-1 text-xs">
                Close
              </TooltipContent>
            </Tooltip>
          </div>
          <Toolbar
            orientation="vertical"
            className="grid min-w-44 grid-cols-[max-content_1fr] items-center gap-x-3 gap-y-1.5 rounded-md border-0 bg-transparent p-0 shadow-none"
          >
            <label
              className="contents"
              onClick={(event) => event.stopPropagation()}
            >
              <span className="text-xs font-bold text-secondary">Distance</span>
              <DistanceInput
                className="justify-self-end"
                distance={normalizedDistance}
                isSelected={isSelected}
                onActivate={onActivate}
                onCommit={onDistanceChange}
              />
            </label>
            <div className="contents">
              <span className="text-xs font-bold text-secondary">Clip</span>
              <ClipSelect
                className="justify-self-end"
                clip={clip}
                isSelected={isSelected}
                onActivate={onActivate}
                onChange={onClipChange}
              />
            </div>
          </Toolbar>
        </PopoverContent>
      </Popover>
    );
  }

  if (variant === "stacked") {
    return (
      <Toolbar
        orientation="vertical"
        className={cn("gap-1 rounded-md p-1", className)}
        {...props}
      >
        <div className="flex gap-0.5">
          <ClipButton
            compact
            label="U"
            title="Unclipped"
            isActive={clip === Clip.Unclipped}
            isSelected={isSelected}
            onClick={() => onClipChange(Clip.Unclipped)}
          />
          <ClipButton
            compact
            label="G"
            title="Ground"
            isActive={clip === Clip.Ground}
            isSelected={isSelected}
            onClick={() => onClipChange(Clip.Ground)}
          />
          <ClipButton
            compact
            label="S"
            title="Sky"
            isActive={clip === Clip.Sky}
            isSelected={isSelected}
            onClick={() => onClipChange(Clip.Sky)}
          />
        </div>
        <DistanceInput
          distance={normalizedDistance}
          isSelected={isSelected}
          onActivate={onActivate}
          onCommit={onDistanceChange}
        />
      </Toolbar>
    );
  }

  return (
    <Toolbar className={cn("gap-1", className)} {...props}>
      <DistanceInput
        distance={normalizedDistance}
        isSelected={isSelected}
        onActivate={onActivate}
        onCommit={onDistanceChange}
      />
      <ToolbarSeparator />
      <ClipButton
        label="U"
        title="Unclipped"
        isActive={clip === Clip.Unclipped}
        isSelected={isSelected}
        onClick={() => onClipChange(Clip.Unclipped)}
      />
      <ClipButton
        label="G"
        title="Ground"
        isActive={clip === Clip.Ground}
        isSelected={isSelected}
        onClick={() => onClipChange(Clip.Ground)}
      />
      <ClipButton
        label="S"
        title="Sky"
        isActive={clip === Clip.Sky}
        isSelected={isSelected}
        onClick={() => onClipChange(Clip.Sky)}
      />
    </Toolbar>
  );
}

function DistanceInput({
  distance,
  isSelected,
  className,
  compact = false,
  onActivate,
  onCommit,
}: {
  distance: PicturePropertyValue;
  isSelected: boolean;
  className?: string;
  compact?: boolean;
  onActivate?: () => void;
  onCommit: (distance: number) => void;
}) {
  const commitInput = (input: HTMLInputElement) => {
    const nextDistance = parseDistance(
      input.value,
      distance === MIXED_VALUE ? null : distance,
    );

    if (nextDistance === null) {
      input.value = distance === MIXED_VALUE ? "" : String(distance);
      return;
    }

    input.value = String(nextDistance);
    if (distance === MIXED_VALUE || nextDistance !== distance) {
      onCommit(nextDistance);
    }
  };
  return (
    <input
      key={`${distance}`}
      aria-label="Picture distance"
      className={cn(
        compact
          ? "h-8 w-12 rounded-md border border-default bg-screen px-1 text-center text-xs font-bold outline-hidden focus-visible:focus-ring"
          : "h-7 w-16 rounded-md border border-default bg-screen px-1 text-center text-xs font-bold outline-hidden focus-visible:focus-ring",
        isSelected ? "text-primary" : "text-secondary",
        className,
      )}
      defaultValue={distance === MIXED_VALUE ? "" : distance}
      placeholder={distance === MIXED_VALUE ? "Mixed" : undefined}
      inputMode="numeric"
      type="number"
      min={MIN_DISTANCE}
      max={MAX_DISTANCE}
      step={1}
      onClick={(event) => {
        event.stopPropagation();
        onActivate?.();
      }}
      onFocus={() => onActivate?.()}
      onChange={(event) => {
        event.stopPropagation();
      }}
      onBlur={(event) => commitInput(event.currentTarget)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key !== "Enter") return;
        event.preventDefault();
        commitInput(event.currentTarget);
        event.currentTarget.blur();
      }}
    />
  );
}

function ClipButton({
  label,
  title,
  isActive,
  isSelected,
  compact = false,
  onClick,
}: {
  label: string;
  title: string;
  isActive: boolean;
  isSelected: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  const button = (
    <Button
      type="button"
      size="sm"
      className={cn(
        compact ? "h-6 min-w-5 px-1.5 text-xs leading-none" : "w-8 px-0",
        isSelected ? "text-primary" : "text-secondary",
        isActive &&
          (isSelected
            ? "bg-primary-hover/50"
            : "bg-primary/60 text-primary hover:bg-primary-hover/50"),
      )}
      aria-label={title}
      aria-pressed={isActive}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {label}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger>{button}</TooltipTrigger>
      <TooltipContent side="top" className="z-[70] px-2 py-1 text-xs">
        {title}
      </TooltipContent>
    </Tooltip>
  );
}

function ClipSelect({
  clip,
  isSelected,
  className,
  compact = false,
  onActivate,
  onChange,
}: {
  clip: Clip | typeof MIXED_VALUE;
  isSelected: boolean;
  className?: string;
  compact?: boolean;
  onActivate?: () => void;
  onChange: (clip: Clip) => void;
}) {
  return (
    <select
      aria-label="Picture clipping"
      className={cn(
        compact
          ? "[field-sizing:content] h-8 w-fit rounded-md border border-default bg-screen py-0 pr-5 pl-2 text-right text-xs font-bold outline-hidden [text-align-last:right] focus-visible:focus-ring"
          : "[field-sizing:content] h-6 w-fit rounded-md border border-default bg-screen py-0 pr-4 pl-1.5 text-right text-xs font-bold outline-hidden [text-align-last:right] focus-visible:focus-ring",
        isSelected ? "text-primary" : "text-secondary",
        className,
      )}
      value={clip}
      onClick={(event) => {
        event.stopPropagation();
        onActivate?.();
      }}
      onFocus={() => onActivate?.()}
      onChange={(event) => {
        event.stopPropagation();
        onChange(parseClip(event.currentTarget.value, clip));
      }}
    >
      <option value={MIXED_VALUE} disabled>
        Mixed
      </option>
      <option value={Clip.Sky}>Sky</option>
      <option value={Clip.Ground}>Ground</option>
      <option value={Clip.Unclipped}>Unclipped</option>
    </select>
  );
}

export function normalizeDistance(distance: number) {
  if (!Number.isFinite(distance)) return MAX_DISTANCE;
  return Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, Math.round(distance)));
}

function parseDistance(value: string, fallback: number | null): number | null {
  if (value.trim() === "") return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;

  return normalizeDistance(parsed);
}

function parseClip(value: string, fallback: Clip | typeof MIXED_VALUE) {
  const parsed = Number(value);
  if (
    parsed === Clip.Unclipped ||
    parsed === Clip.Ground ||
    parsed === Clip.Sky
  ) {
    return parsed;
  }

  return fallback === MIXED_VALUE ? Clip.Unclipped : fallback;
}

function getClipCode(clip: Clip | typeof MIXED_VALUE) {
  if (clip === MIXED_VALUE) return "M";
  if (clip === Clip.Unclipped) return "U";
  if (clip === Clip.Ground) return "G";
  return "S";
}

function getClipLabel(clip: Clip | typeof MIXED_VALUE) {
  if (clip === MIXED_VALUE) return "Mixed";
  if (clip === Clip.Unclipped) return "Unclipped";
  if (clip === Clip.Ground) return "Ground";
  return "Sky";
}

function getDistanceLabel(distance: PicturePropertyValue) {
  return distance === MIXED_VALUE ? "Mixed" : String(distance);
}
