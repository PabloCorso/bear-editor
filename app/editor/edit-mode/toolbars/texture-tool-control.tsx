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
import {
  useTextureMaskSprites,
  useTextureSprites,
} from "~/components/use-lgr-assets";
import { useEditorActiveTool } from "~/editor/use-editor-store";
import type { TextureFillToolState } from "../tools/texture-fill-tool";
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
  const { setToolState, activateTool, setToolMenuOpen } = useEditorActions();
  const activeTool = useEditorActiveTool();
  const isActive =
    activeTool?.meta.id === defaultTools.texture.id ||
    activeTool?.meta.id === defaultTools.textureFill.id;
  const fillMode = activeTool?.meta.id === defaultTools.textureFill.id;
  const fillTool = useEditorToolState<TextureFillToolState>(
    defaultTools.textureFill.id,
  );
  const textureSprites = useTextureMaskSprites();
  const fillSprites = useTextureSprites();
  const [rowSettings, setRowSettings] = useState<
    Record<string, Pick<TextureToolState, "distance" | "clip">>
  >({});
  const maxTextureSpriteDimension = Math.max(
    ...textureSprites.map(({ width = 0, height = 0 }) =>
      Math.max(width, height),
    ),
    1,
  );
  const selectedTexture =
    (fillMode ? fillTool?.texture : textureTool?.texture) ??
    textureTool?.texture ??
    defaultTextureState.texture;
  const selectedMask = textureTool?.mask ?? standardSprites.textureMasks[0];
  const defaultTextureSprite = textureSprites.find(
    ({ texture, mask }) =>
      texture.texture === defaultTextureState.texture &&
      mask === defaultTextureState.mask,
  );
  const textureSrc =
    defaultTextureSprite?.maskedSrc ?? defaultTextureSprite?.src;
  const selectedDistance =
    (fillMode ? fillTool?.distance : textureTool?.distance) ??
    defaultTextureState.distance;
  const selectedClip =
    (fillMode ? fillTool?.clip : textureTool?.clip) ?? defaultTextureState.clip;
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
    if (fillMode) {
      setToolState<TextureFillToolState>(defaultTools.textureFill.id, {
        texture: texture.texture,
        ...settings,
      });
    } else {
      setToolState<TextureToolState>(defaultTools.texture.id, {
        texture: texture.texture,
        mask,
        ...settings,
      });
    }
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

  const fillItems = fillSprites.map(({ texture, src, width, height }) => {
    const isSelected = texture.texture === selectedTexture;
    const { distance, clip } = isSelected
      ? { distance: selectedDistance, clip: selectedClip }
      : texture;
    const update = (patch: Partial<TextureFillToolState> = {}) => {
      setToolState<TextureFillToolState>(defaultTools.textureFill.id, {
        texture: texture.texture,
        distance,
        clip,
        ...patch,
      });
    };
    return {
      key: texture.texture,
      label: formatSpriteTitle(texture.texture),
      previewSrc: src,
      width,
      height,
      isSelected,
      distance,
      clip,
      defaultDistance: texture.distance,
      defaultClip: texture.clip,
      onActivate: () => update(),
      onDistanceChange: (distance: number) => update({ distance }),
      onClipChange: (clip: TextureFillToolState["clip"]) => update({ clip }),
      onResetDefaults: () =>
        update({ distance: texture.distance, clip: texture.clip }),
    };
  });

  const modePicker = (
    <div
      className="flex items-center gap-1 rounded-md border border-default p-0.5"
      role="group"
      aria-label="Texture application mode"
    >
      <button
        type="button"
        aria-pressed={!fillMode}
        className={`rounded px-3 py-1 text-xs ${!fillMode ? "bg-primary-hover/50 text-primary" : "text-secondary hover:text-primary"}`}
        onClick={() => {
          setToolState<TextureToolState>(defaultTools.texture.id, {
            texture: selectedTexture,
            mask: selectedMask,
            distance: selectedDistance,
            clip: selectedClip,
          });
          activateTool(defaultTools.texture.id);
          setToolMenuOpen(true, defaultTools.texture.id);
        }}
      >
        Place
      </button>
      <button
        type="button"
        aria-pressed={fillMode}
        className={`rounded px-3 py-1 text-xs ${fillMode ? "bg-primary-hover/50 text-primary" : "text-secondary hover:text-primary"}`}
        onClick={() => {
          setToolState<TextureFillToolState>(defaultTools.textureFill.id, {
            texture: selectedTexture,
            distance: selectedDistance,
            clip: selectedClip,
          });
          activateTool(defaultTools.textureFill.id);
          setToolMenuOpen(true, defaultTools.texture.id);
        }}
      >
        Fill
      </button>
    </div>
  );

  return (
    <ToolControlMenu
      id={defaultTools.texture.id}
      button={
        <ToolControlButton
          isLoading={!textureSrc}
          {...defaultTools.texture}
          {...props}
          id={undefined}
          isActive={isActive}
          onClick={() => {
            if (!isActive) activateTool(defaultTools.texture.id);
          }}
        >
          <PictureIcon src={textureSrc} />
        </ToolControlButton>
      }
    >
      <PictureTexturePicker
        header={modePicker}
        maxColumns={4}
        rowHeaders={fillMode ? undefined : rowHeaders}
        items={fillMode ? fillItems : pickerItems}
        maxSpriteDimension={
          fillMode
            ? Math.max(
                1,
                ...fillSprites.map((s) =>
                  Math.max(s.width ?? 0, s.height ?? 0),
                ),
              )
            : maxTextureSpriteDimension
        }
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
