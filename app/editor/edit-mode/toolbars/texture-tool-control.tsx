import { useState } from "react";
import { PicturePropertiesToolbar } from "./picture-properties-toolbar";
import { PictureIcon } from "~/components/sprite-icon";
import {
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import {
  ToolControlButton,
  ToolControlMenu,
  type ToolControlButtonProps,
} from "./tool";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import { useTextureMaskSprites } from "~/components/use-lgr-assets";
import { standardSprites } from "~/components/standard-sprites";
import { Mask } from "~/editor/elma-types";
import {
  defaultTextureState,
  type TextureToolState,
} from "~/editor/edit-mode/tools/texture-tool";
import {
  formatSpriteTitle,
  PictureTexturePicker,
} from "./picture-texture-picker";

export function TextureToolControl(props: ToolControlButtonProps) {
  const textureTool = useEditorToolState<TextureToolState>(
    defaultTools.texture.id,
  );
  const { setToolState } = useEditorActions();
  const textureSprites = useTextureMaskSprites();
  const [rowSettings, setRowSettings] = useState<
    Record<string, Pick<TextureToolState, "distance" | "clip">>
  >({});
  const maxTextureSpriteDimension = Math.max(
    ...textureSprites.map(({ width = 0, height = 0 }) =>
      Math.max(width, height),
    ),
    1,
  );
  const selectedTexture = textureTool?.texture ?? defaultTextureState.texture;
  const selectedMask = textureTool?.mask ?? standardSprites.textureMasks[0];
  const selectedTextureSprite = textureSprites.find(
    ({ texture, mask }) =>
      texture.texture === selectedTexture && mask === selectedMask,
  );
  const textureSrc =
    selectedTextureSprite?.maskedSrc ?? selectedTextureSprite?.src;
  const selectedDistance =
    textureTool?.distance ?? defaultTextureState.distance;
  const selectedClip = textureTool?.clip ?? defaultTextureState.clip;
  const rowHeaders: Record<string, React.ReactNode> = {};
  const groupedTextures = new Set<string>();
  const settingsFor = (texture: (typeof textureSprites)[number]["texture"]) =>
    texture.texture === selectedTexture
      ? { distance: selectedDistance, clip: selectedClip }
      : (rowSettings[texture.texture] ?? {
          distance: texture.distance,
          clip: texture.clip,
        });

  function activate(
    texture: (typeof textureSprites)[number]["texture"],
    mask: string,
    patch: Partial<Pick<TextureToolState, "distance" | "clip">> = {},
  ) {
    const settings = { ...settingsFor(texture), ...patch };
    setRowSettings((previous) => ({
      ...previous,
      [selectedTexture]: { distance: selectedDistance, clip: selectedClip },
      [texture.texture]: settings,
    }));
    setToolState<TextureToolState>(defaultTools.texture.id, {
      texture: texture.texture,
      mask,
      ...settings,
    });
  }

  const pickerItems = textureSprites.map(
    ({ texture, mask: textureMask, ...sprite }) => {
      const isSelected =
        texture.texture === selectedTexture && textureMask === selectedMask;
      const textureLabel = formatSpriteTitle(texture.texture);
      const activateTexture = () => activate(texture, textureMask);
      if (!groupedTextures.has(texture.texture)) {
        groupedTextures.add(texture.texture);
        const settings = settingsFor(texture);
        rowHeaders[`${textureMask}-${texture.texture}`] = (
          <>
            <span className="mr-auto text-xs font-medium text-primary">
              {textureLabel}
            </span>
            <PicturePropertiesToolbar
              className="ml-auto w-auto"
              variant="summary-popover"
              distance={settings.distance}
              clip={settings.clip}
              defaultDistance={texture.distance}
              defaultClip={texture.clip}
              onDistanceChange={(distance) =>
                activate(texture, selectedMask, { distance })
              }
              onClipChange={(clip) => activate(texture, selectedMask, { clip })}
              onResetDefaults={() =>
                activate(texture, selectedMask, {
                  distance: texture.distance,
                  clip: texture.clip,
                })
              }
            />
          </>
        );
      }

      return {
        key: `${textureMask}-${texture.texture}`,
        label: formatMaskTitle(textureMask),
        title: `${texture.texture} ${textureMask}`,
        previewSrc: sprite.maskedSrc ?? sprite.src,
        previewClassName: getTexturePreviewClassName(textureMask),
        width: sprite.width,
        height: sprite.height,
        isSelected,
        onActivate: activateTexture,
      };
    },
  );

  return (
    <ToolControlMenu
      id={defaultTools.texture.id}
      button={
        <ToolControlButton
          isLoading={!textureSrc}
          {...defaultTools.texture}
          {...props}
        >
          <PictureIcon src={textureSrc} />
        </ToolControlButton>
      }
    >
      <PictureTexturePicker
        maxColumns={4}
        rowHeaders={rowHeaders}
        items={pickerItems}
        maxSpriteDimension={maxTextureSpriteDimension}
      />
    </ToolControlMenu>
  );
}

function getTexturePreviewClassName(mask: string) {
  return mask === Mask.Litt ? "h-3 w-3" : "h-full w-full";
}

function formatMaskTitle(mask: string) {
  switch (mask) {
    case Mask.Big:
      return "big";
    case Mask.Horizontal:
      return "hor";
    case Mask.Litt:
      return "litt";
    case Mask.Top:
      return "top";
    default:
      return mask;
  }
}
