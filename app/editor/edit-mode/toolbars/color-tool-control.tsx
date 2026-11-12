import { Clip } from "~/editor/elma-types";
import { PicturePropertiesToolbar } from "./picture-properties-toolbar";
import { PaletteIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useMemo, useState } from "react";
import type { LgrAssets } from "~/components/lgr-assets";
import { useLgrAssets } from "~/components/use-lgr-assets";
import { Switch } from "~/components/ui/switch";
import {
  useEditorActions,
  useEditorToolState,
  useEditorActiveTool,
} from "~/editor/use-editor-store";
import { defaultTools } from "../tools/default-tools";
import type { ColorToolState } from "../tools/color-tool";
import type { SceneryFillToolState } from "../tools/scenery-fill-tool";
import { getColorPalette } from "./color-palette";
import { PictureTexturePicker } from "./picture-texture-picker";
import {
  ToolControlButton,
  ToolControlMenu,
  type ToolControlButtonProps,
} from "./tool";

type ColorSprite = ReturnType<LgrAssets["getColorSprites"]>[number];

export function ColorToolControl(props: ToolControlButtonProps) {
  const { lgr, isLoaded } = useLgrAssets();
  const colors = useMemo(
    () => lgr.getColorSprites(),
    // The shared initial loader fills in place before isLoaded changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lgr, isLoaded],
  );
  return (
    <ColorListControl
      key={lgr.name.toLowerCase()}
      colors={colors}
      lgr={lgr}
      isLoaded={isLoaded}
      {...props}
    />
  );
}

function ColorListControl({
  colors,
  lgr,
  isLoaded,
  ...props
}: ToolControlButtonProps & {
  colors: ColorSprite[];
  lgr: LgrAssets;
  isLoaded: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const { ordered, baseNames } = useMemo(
    () => getColorPalette(colors),
    [colors],
  );
  const state = useEditorToolState<ColorToolState>(defaultTools.color.id);
  const fillState = useEditorToolState<SceneryFillToolState>(
    defaultTools.colorFill.id,
  );
  const activeTool = useEditorActiveTool();
  const fillMode = activeTool?.meta.id === defaultTools.colorFill.id;
  const isActive = fillMode || activeTool?.meta.id === defaultTools.color.id;
  const { setToolState, activateTool, setToolMenuOpen } = useEditorActions();
  const selectedName = fillMode ? fillState?.name : state?.name;
  const selectedColor =
    colors.find(({ picture }) => picture.name === selectedName) ??
    ordered.find(({ picture }) => baseNames.has(picture.name));
  const visibleColors = showAll
    ? ordered
    : ordered.filter(
        ({ picture }) =>
          baseNames.has(picture.name) || picture.name === selectedName,
      );

  const distance =
    (fillMode ? fillState?.distance : state?.distance) ??
    selectedColor?.picture.distance ?? 0;
  const clip =
    (fillMode ? fillState?.clip : state?.clip) ??
    selectedColor?.picture.clip ?? Clip.Unclipped;

  // Keep the placement choice aligned with the colors available in the loaded LGR,
  // including when the tool is activated by keyboard without opening its picker.
  useEffect(
    function synchronizeColorSelection() {
      if (!isLoaded) return;
      if (!selectedColor) {
        if (state?.name) {
          setToolState<ColorToolState>(defaultTools.color.id, {
            name: "",
            propertiesMenu: undefined,
          });
        }
        return;
      }
      if (state?.name === selectedColor.picture.name) return;
      setToolState<ColorToolState>(defaultTools.color.id, {
        name: selectedColor.picture.name,
        distance,
        clip,
      });
    },
    [isLoaded, selectedColor, state?.name, distance, clip, setToolState],
  );

  function updateColor(patch: Partial<SceneryFillToolState>) {
    if (fillMode) {
      setToolState<SceneryFillToolState>(defaultTools.colorFill.id, patch);
    } else {
      setToolState<ColorToolState>(defaultTools.color.id, patch);
    }
  }

  function activate(color: ColorSprite) {
    updateColor({ name: color.picture.name, distance, clip });
  }

  function switchMode(nextFill: boolean) {
    const name = selectedColor?.picture.name ?? "";
    if (nextFill) {
      setToolState<SceneryFillToolState>(defaultTools.colorFill.id, {
        name, distance, clip,
      });
      activateTool(defaultTools.colorFill.id);
      setToolMenuOpen(true, defaultTools.color.id);
    } else {
      setToolState<ColorToolState>(defaultTools.color.id, {
        name, distance, clip,
      });
      activateTool(defaultTools.color.id);
      setToolMenuOpen(true, defaultTools.color.id);
    }
  }
  const modePicker = (
    <div className="flex items-center gap-1 rounded-md border border-default p-0.5" role="group" aria-label="Color application mode">
      <button
        type="button"
        aria-pressed={!fillMode}
        className={`rounded px-3 py-1 text-xs ${!fillMode ? "bg-primary-hover/50 text-primary" : "text-secondary hover:text-primary"}`}
        onClick={() => switchMode(false)}
      >
        Place
      </button>
      <button
        type="button"
        aria-pressed={fillMode}
        className={`rounded px-3 py-1 text-xs ${fillMode ? "bg-primary-hover/50 text-primary" : "text-secondary hover:text-primary"}`}
        onClick={() => switchMode(true)}
        title="Repeat the selected color tile over a polygon; edges may extend beyond it."
      >
        Fill
      </button>
    </div>
  );

  const items = visibleColors.map((color) => {
    const { picture } = color;
    return {
      key: picture.name,
      label: picture.name,
      title: `${picture.name} · #${color.rgb
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()}`,
      previewSrc: lgr.getSpritePreview(picture.name),
      width: color.width,
      height: color.height,
      isSelected: selectedName === picture.name,
      onActivate: () => activate(color),
    };
  });

  return (
    <ToolControlMenu
      id={defaultTools.color.id}
      button={
        <ToolControlButton
          {...defaultTools.color}
          {...props}
          id={undefined}
          isActive={isActive}
          isLoading={!isLoaded}
          onClick={() => {
            if (!isActive) {
              if (selectedColor) {
                setToolState<ColorToolState>(defaultTools.color.id, {
                  name: selectedColor.picture.name, distance, clip,
                });
              } else {
                setToolState<ColorToolState>(defaultTools.color.id, { name: "" });
              }
              activateTool(defaultTools.color.id);
      setToolMenuOpen(true, defaultTools.color.id);
            }
          }}
        >
          <PaletteIcon />
        </ToolControlButton>
      }
    >
      <div className="flex max-h-full flex-col gap-1">
        {colors.length ? (
          <PictureTexturePicker
            items={items}
            maxSpriteDimension={201}
            compact
            maxColumns={showAll ? 6 : 4}
            placementSettings={
              <PicturePropertiesToolbar
                className="w-auto"
                variant="summary-popover"
                distance={distance}
                clip={clip}
                defaultDistance={selectedColor?.picture.distance}
                defaultClip={selectedColor?.picture.clip}
                onDistanceChange={(distance) => updateColor({ distance })}
                onClipChange={(clip) => updateColor({ clip })}
                onResetDefaults={() => {
                  if (!selectedColor) return;
                  updateColor({
                    distance: selectedColor.picture.distance,
                    clip: selectedColor.picture.clip,
                  });
                }}
              />
            }
            header={
              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                {modePicker}
                {colors.length > baseNames.size && (
                <label
                  title={`Show all ${colors.length} colors`}
                  className="inline-flex cursor-pointer items-center gap-1.5 pl-1 text-[10px] text-secondary"
                >
                  <Switch checked={showAll} onCheckedChange={setShowAll} />
                  <span className="sr-only">
                    Show all {colors.length} colors
                  </span>
                  <span aria-hidden="true" className="whitespace-nowrap">
                    All {colors.length}
                  </span>
                </label>
              )}
              </div>
            }
          />
        ) : (
          <p className="rounded-xl border border-default bg-screen/90 p-2 text-xs text-secondary">
            No color pictures in this LGR.
          </p>
        )}
      </div>
    </ToolControlMenu>
  );
}
