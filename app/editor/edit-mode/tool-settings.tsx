import type { ReactNode } from "react";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { IconButton } from "~/components/ui/button";
import { NumberInput } from "~/components/ui/number-input";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "~/components/ui/segmented-control";
import { Icon } from "~/components/ui/icon";
import { VertexIcon, getVertexIconProps } from "./toolbars/vertex-tool-control";
import {
  useEditor,
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import { ELMA_PIXELS_PER_WORLD_UNIT } from "~/editor/constants";
import { defaultAutoGrassOptions } from "~/editor/helpers/auto-grass";
import {
  DEFAULT_PIPE_WIDTH_PX,
  MIN_PIPE_WIDTH_PX,
  MAX_PIPE_WIDTH_PX,
  DEFAULT_PIPE_APPLE_COUNT,
  MAX_PIPE_APPLE_COUNT,
  DEFAULT_PIPE_APPLE_DISTANCE,
  PIPE_APPLE_DISTANCE_STEP,
  MAX_PIPE_APPLE_DISTANCE,
  PIPE_APPLE_MODES,
} from "~/editor/helpers/pipe";
import {
  DEFAULT_FRAME_WIDTH_PX,
  MIN_FRAME_WIDTH_PX,
  MAX_FRAME_WIDTH_PX,
  FRAME_MODES,
  FRAME_MODE_LABELS,
} from "~/editor/helpers/frame";
import {
  DEFAULT_CUT_CONNECT_WIDTH_PX,
  MIN_CUT_CONNECT_WIDTH_PX,
  MAX_CUT_CONNECT_WIDTH_PX,
} from "~/editor/helpers/cut-and-connect";
import type { VertexToolState } from "./tools/vertex-tool";
export function ToolSettingsPanel() {
  return (
    <div className="columns-1 gap-3 sm:columns-2">
      <VertexShapeSettings />
    </div>
  );
}

function VertexShapeSettings() {
  const vertex = useEditorToolState<VertexToolState>("vertex");
  const autoGrass = useEditor((state) => state.autoGrassOptions);
  const { setToolState, setAutoGrassOptions } = useEditorActions();
  const update = (patch: Partial<VertexToolState>) =>
    setToolState<VertexToolState>("vertex", {
      drawingPolygon: vertex?.drawingPolygon ?? { vertices: [], grass: false },
      ...patch,
    });

  return (
    <>
      <ToolSettingsSection
        title="AutoGrass"
        icon={<VertexIcon {...getVertexIconProps("autoGrass")} />}
        onReset={() => setAutoGrassOptions(defaultAutoGrassOptions)}
        isDefault={
          autoGrass.depth === defaultAutoGrassOptions.depth &&
          autoGrass.endInset === defaultAutoGrassOptions.endInset
        }
      >
        <NumberSetting
          label="Height (px)"
          name="AutoGrass height"
          value={Math.round(autoGrass.depth * ELMA_PIXELS_PER_WORLD_UNIT)}
          min={1}
          max={200}
          onChange={(value) =>
            setAutoGrassOptions({ depth: value / ELMA_PIXELS_PER_WORLD_UNIT })
          }
        />
        <NumberSetting
          label="End inset (px)"
          name="AutoGrass end inset"
          value={Math.round(autoGrass.endInset * ELMA_PIXELS_PER_WORLD_UNIT)}
          min={0}
          max={200}
          onChange={(value) =>
            setAutoGrassOptions({
              endInset: value / ELMA_PIXELS_PER_WORLD_UNIT,
            })
          }
        />
      </ToolSettingsSection>
      <ToolSettingsSection
        title="Pipe"
        icon={<VertexIcon {...getVertexIconProps("pipe")} />}
        onReset={() =>
          update({
            pipeWidthPx: DEFAULT_PIPE_WIDTH_PX,
            pipeAppleMode: "none",
            pipeAppleDistance: DEFAULT_PIPE_APPLE_DISTANCE,
            pipeAppleCount: DEFAULT_PIPE_APPLE_COUNT,
          })
        }
        isDefault={
          (vertex?.pipeWidthPx ?? DEFAULT_PIPE_WIDTH_PX) ===
            DEFAULT_PIPE_WIDTH_PX &&
          (vertex?.pipeAppleMode ?? "none") === "none" &&
          (vertex?.pipeAppleDistance ?? DEFAULT_PIPE_APPLE_DISTANCE) ===
            DEFAULT_PIPE_APPLE_DISTANCE &&
          (vertex?.pipeAppleCount ?? DEFAULT_PIPE_APPLE_COUNT) ===
            DEFAULT_PIPE_APPLE_COUNT
        }
      >
        <NumberSetting
          label="Width (px)"
          name="Pipe width"
          value={vertex?.pipeWidthPx ?? DEFAULT_PIPE_WIDTH_PX}
          min={MIN_PIPE_WIDTH_PX}
          max={MAX_PIPE_WIDTH_PX}
          onChange={(pipeWidthPx) => update({ pipeWidthPx })}
        />
        <ChoiceSetting
          label="Apples"
          name="Pipe apple placement"
          value={vertex?.pipeAppleMode ?? "none"}
          options={PIPE_APPLE_MODES.map((value) => ({
            value,
            label: { none: "None", distance: "Distance", count: "Count" }[
              value
            ],
          }))}
          onChange={(pipeAppleMode) => update({ pipeAppleMode })}
        />
        {vertex?.pipeAppleMode === "distance" && (
          <NumberSetting
            label="Apple spacing (units)"
            name="Pipe apple distance"
            value={vertex.pipeAppleDistance ?? DEFAULT_PIPE_APPLE_DISTANCE}
            min={PIPE_APPLE_DISTANCE_STEP}
            max={MAX_PIPE_APPLE_DISTANCE}
            step={PIPE_APPLE_DISTANCE_STEP}
            onChange={(pipeAppleDistance) => update({ pipeAppleDistance })}
          />
        )}
        {vertex?.pipeAppleMode === "count" && (
          <NumberSetting
            label="Apple count"
            name="Pipe apple count"
            value={vertex.pipeAppleCount ?? DEFAULT_PIPE_APPLE_COUNT}
            min={0}
            max={MAX_PIPE_APPLE_COUNT}
            onChange={(pipeAppleCount) => update({ pipeAppleCount })}
          />
        )}
      </ToolSettingsSection>
      <ToolSettingsSection
        title="Frame"
        icon={<VertexIcon {...getVertexIconProps("frame")} />}
        onReset={() =>
          update({ frameWidthPx: DEFAULT_FRAME_WIDTH_PX, frameMode: "inside" })
        }
        isDefault={
          (vertex?.frameWidthPx ?? DEFAULT_FRAME_WIDTH_PX) ===
            DEFAULT_FRAME_WIDTH_PX &&
          (vertex?.frameMode ?? "inside") === "inside"
        }
      >
        <NumberSetting
          label="Width (px)"
          name="Frame width"
          value={vertex?.frameWidthPx ?? DEFAULT_FRAME_WIDTH_PX}
          min={MIN_FRAME_WIDTH_PX}
          max={MAX_FRAME_WIDTH_PX}
          onChange={(frameWidthPx) => update({ frameWidthPx })}
        />
        <ChoiceSetting
          label="Position"
          name="Frame position"
          value={vertex?.frameMode ?? "inside"}
          options={FRAME_MODES.map((value) => ({
            value,
            label: FRAME_MODE_LABELS[value],
          }))}
          onChange={(frameMode) => update({ frameMode })}
        />
      </ToolSettingsSection>
      <ToolSettingsSection
        title="Cut & Connect"
        icon={<VertexIcon {...getVertexIconProps("cutConnect")} />}
        onReset={() =>
          update({ cutConnectWidthPx: DEFAULT_CUT_CONNECT_WIDTH_PX })
        }
        isDefault={
          (vertex?.cutConnectWidthPx ?? DEFAULT_CUT_CONNECT_WIDTH_PX) ===
          DEFAULT_CUT_CONNECT_WIDTH_PX
        }
      >
        <NumberSetting
          label="Width (px)"
          name="Cut & Connect width"
          value={vertex?.cutConnectWidthPx ?? DEFAULT_CUT_CONNECT_WIDTH_PX}
          min={MIN_CUT_CONNECT_WIDTH_PX}
          max={MAX_CUT_CONNECT_WIDTH_PX}
          onChange={(cutConnectWidthPx) => update({ cutConnectWidthPx })}
        />
      </ToolSettingsSection>
    </>
  );
}

function ToolSettingsSection({
  title,
  icon,
  children,
  onReset,
  isDefault,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  onReset: () => void;
  isDefault: boolean;
}) {
  return (
    <section
      aria-label={`${title} settings`}
      className="mb-3 min-w-0 break-inside-avoid overflow-hidden rounded-lg border border-separator"
    >
      <div className="flex h-10 items-center justify-between gap-2 border-b border-separator bg-primary/40 px-3">
        <div className="flex min-w-0 items-center gap-2 text-secondary">
          <Icon size="sm" aria-hidden="true">
            {icon}
          </Icon>
          <div className="min-w-0">
            <h2 className="text-xs font-medium text-primary">{title}</h2>
          </div>
        </div>
        <IconButton
          size="sm"
          iconSize="sm"
          className="size-6 text-secondary disabled:opacity-20"
          aria-label={`Reset ${title} defaults`}
          title="Reset defaults"
          onClick={onReset}
          disabled={isDefault}
        >
          <ArrowCounterClockwiseIcon />
        </IconButton>
      </div>
      <div className="grid min-w-0 gap-2.5 p-3">{children}</div>
    </section>
  );
}

function NumberSetting({
  label,
  name,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_10rem] items-center gap-2 text-xs">
      <span className="text-secondary">{label}</span>
      <NumberInput
        aria-label={name}
        size="sm"
        value={value}
        min={min}
        max={max}
        step={step}
        className="w-full justify-between text-primary"
        inputProps={{ className: "min-w-0 flex-1 text-center" }}
        onValueChange={(next) => {
          if (next !== null && Number.isFinite(next)) onChange(next);
        }}
      />
    </div>
  );
}

function ChoiceSetting<T extends string | number>({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_10rem] items-center gap-2 text-xs">
      <span className="text-secondary">{label}</span>
      <SegmentedControl
        aria-label={name}
        value={value}
        onValueChange={onChange}
        className="w-full min-w-0"
      >
        {options.map((option) => (
          <SegmentedControlItem
            key={option.value}
            value={option.value}
            aria-label={option.label}
            title={option.label}
            className="h-6 px-1.5"
          >
            {option.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </div>
  );
}
