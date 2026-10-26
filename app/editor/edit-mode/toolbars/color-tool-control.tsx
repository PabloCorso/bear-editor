import { Clip } from "~/editor/elma-types";
import { PicturePropertiesToolbar } from "./picture-properties-toolbar";
import { PaletteIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { LgrAssets } from "~/components/lgr-assets";
import { useLgrAssets } from "~/components/use-lgr-assets";
import { Switch } from "~/components/ui/switch";
import {
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import { defaultTools } from "../tools/default-tools";
import type { ColorToolState } from "../tools/color-tool";
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
  const { setToolState } = useEditorActions();
  const selectedColor =
    colors.find(({ picture }) => picture.name === state?.name) ??
    ordered.find(({ picture }) => baseNames.has(picture.name));
  const visibleColors = showAll
    ? ordered
    : ordered.filter(
        ({ picture }) =>
          baseNames.has(picture.name) || picture.name === state?.name,
      );

  const distance = state?.distance ?? selectedColor?.picture.distance ?? 0;
  const clip = state?.clip ?? selectedColor?.picture.clip ?? Clip.Unclipped;

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

  function activate(color: ColorSprite) {
    setToolState<ColorToolState>(defaultTools.color.id, {
      name: color.picture.name,
      distance,
      clip,
    });
  }

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
      isSelected: state?.name === picture.name,
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
          isLoading={!isLoaded}
          onClick={() => {
            if (selectedColor) activate(selectedColor);
            else
              setToolState<ColorToolState>(defaultTools.color.id, {
                name: "",
              });
          }}
        >
          <PaletteIcon
            className="[&>path:first-of-type]:fill-[var(--palette-fill)] [&>path:first-of-type]:opacity-100"
            weight="duotone"
            color="black"
            style={
              {
                "--palette-fill": selectedColor
                  ? `rgb(${selectedColor.rgb.join(", ")})`
                  : "transparent",
              } as CSSProperties
            }
          />
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
                onDistanceChange={(distance) =>
                  setToolState<ColorToolState>(defaultTools.color.id, {
                    distance,
                  })
                }
                onClipChange={(clip) =>
                  setToolState<ColorToolState>(defaultTools.color.id, {
                    clip,
                  })
                }
                onResetDefaults={() => {
                  if (!selectedColor) return;
                  setToolState<ColorToolState>(defaultTools.color.id, {
                    distance: selectedColor.picture.distance,
                    clip: selectedColor.picture.clip,
                  });
                }}
              />
            }
            header={
              colors.length > baseNames.size && (
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
              )
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
