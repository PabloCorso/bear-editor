import { useState } from "react";
import { NumberInput } from "~/components/ui/number-input";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  type PopoverContentProps,
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

import {
  SettingsPopoverContent,
  SettingsPopoverFields,
} from "./settings-popover";

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
  variant?:
    | "inline"
    | "stacked"
    | "compact-inline"
    | "summary-popover"
    | "popover-content";
  popoverContentProps?: PopoverContentProps;
  propertiesTitle?: string;
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
  popoverContentProps,
  propertiesTitle = "Picture properties",
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
          distance={normalizedDistance}
          isSelected={isSelected}
          onActivate={onActivate}
          onCommit={onDistanceChange}
        />
        <ClipButtons
          clip={clip}
          isSelected={isSelected}
          onActivate={onActivate}
          onChange={onClipChange}
        />
      </Toolbar>
    );
  }

  if (variant === "summary-popover" || variant === "popover-content") {
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

    const content = (
      <SettingsPopoverContent
        title={propertiesTitle}
        closeLabel={`Close ${propertiesTitle.toLowerCase()}`}
        {...popoverContentProps}
        isDefault={isDefault}
        onReset={
          onResetDefaults && hasDefaults
            ? (event) => {
                event.stopPropagation();
                onActivate?.();
                onResetDefaults();
              }
            : undefined
        }
      >
        <SettingsPopoverFields>
          <div
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
          </div>
          <div className="contents">
            <span className="text-xs font-bold text-secondary">Clip</span>
            <ClipButtons
              className="justify-self-end"
              clip={clip}
              isSelected={isSelected}
              onActivate={onActivate}
              onChange={onClipChange}
            />
          </div>
        </SettingsPopoverFields>
      </SettingsPopoverContent>
    );

    if (variant === "popover-content") return content;

    return (
      <Popover modal={false}>
        <PopoverTrigger>
          <button
            type="button"
            className={cn(
              "flex h-6 w-full cursor-pointer items-center justify-center truncate rounded border-0 bg-transparent px-1.5 text-center text-[11px] leading-3 outline-hidden hover:bg-primary-hover/50 hover:text-primary focus-visible:focus-ring aria-expanded:bg-primary-hover/50 aria-expanded:text-primary",
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
        {content}
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
        <ClipButtons
          clip={clip}
          isSelected={isSelected}
          onActivate={onActivate}
          onChange={onClipChange}
        />
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
      <ClipButtons
        clip={clip}
        isSelected={isSelected}
        onActivate={onActivate}
        onChange={onClipChange}
      />
    </Toolbar>
  );
}

function DistanceInput({
  distance,
  isSelected,
  className,
  onActivate,
  onCommit,
}: {
  distance: PicturePropertyValue;
  isSelected: boolean;
  className?: string;
  onActivate?: () => void;
  onCommit: (distance: number) => void;
}) {
  const [draft, setDraft] = useState({
    source: distance,
    value: distance === MIXED_VALUE ? null : distance,
  });

  // External changes (selection, reset, undo) replace any pending edit.
  if (draft.source !== distance) {
    setDraft({
      source: distance,
      value: distance === MIXED_VALUE ? null : distance,
    });
  }

  return (
    <NumberInput
      aria-label="Picture distance"
      size="sm"
      value={draft.value}
      min={MIN_DISTANCE}
      max={MAX_DISTANCE}
      step={10}
      smallStep={10}
      largeStep={10}
      keyboardStep={1}
      snapOnStep={false}
      format={{ maximumFractionDigits: 0, useGrouping: false }}
      onValueChange={(value) => setDraft({ source: distance, value })}
      onValueCommitted={(value) => {
        const nextDistance =
          value === null
            ? distance === MIXED_VALUE
              ? null
              : distance
            : normalizeDistance(value);
        setDraft({ source: distance, value: nextDistance });
        if (
          nextDistance !== null &&
          (distance === MIXED_VALUE || nextDistance !== distance)
        ) {
          onCommit(nextDistance);
        }
      }}
      className={cn(isSelected ? "text-white" : "text-secondary", className)}
      onPointerDownCapture={() => onActivate?.()}
      onFocusCapture={() => onActivate?.()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      inputProps={{
        placeholder: distance === MIXED_VALUE ? "Mixed" : undefined,
        inputMode: "numeric",
        onChange: (event) => event.stopPropagation(),
        onKeyDown: (event) => {
          event.stopPropagation();
          if (event.key !== "Enter") return;
          event.preventDefault();
          event.currentTarget.blur();
        },
      }}
    />
  );
}

function ClipButton({
  label,
  title,
  isActive,
  isSelected,
  onClick,
}: {
  label: string;
  title: string;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const button = (
    <Button
      type="button"
      size="sm"
      className={cn(
        "h-6 min-w-6 px-1.5 text-xs leading-none",
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
      <TooltipContent side="top">{title}</TooltipContent>
    </Tooltip>
  );
}

function ClipButtons({
  clip,
  isSelected,
  className,
  onActivate,
  onChange,
}: {
  clip: Clip | typeof MIXED_VALUE;
  isSelected: boolean;
  className?: string;
  onActivate?: () => void;
  onChange: (clip: Clip) => void;
}) {
  return (
    <div
      role="group"
      aria-label={
        clip === MIXED_VALUE ? "Picture clipping: mixed" : "Picture clipping"
      }
      className={cn("inline-flex items-center gap-0.5", className)}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {clip === MIXED_VALUE && (
        <>
          <span className="px-1 text-xs text-secondary">Mixed</span>
          <span
            aria-hidden="true"
            className="mx-1 h-4 w-px border-l border-default"
          />
        </>
      )}
      {[
        { value: Clip.Sky, label: "S", title: "Sky" },
        { value: Clip.Ground, label: "G", title: "Ground" },
        { value: Clip.Unclipped, label: "U", title: "Unclipped" },
      ].map(({ value, label, title }) => (
        <ClipButton
          key={value}
          label={label}
          title={title}
          isActive={clip === value}
          isSelected={isSelected}
          onClick={() => {
            onActivate?.();
            onChange(value);
          }}
        />
      ))}
    </div>
  );
}

export function normalizeDistance(distance: number) {
  if (!Number.isFinite(distance)) return MAX_DISTANCE;
  return Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, Math.round(distance)));
}

function getClipCode(clip: Clip | typeof MIXED_VALUE) {
  if (clip === MIXED_VALUE) return "Mixed";
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
