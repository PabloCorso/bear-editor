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
  const pickerItems = textureSprites.map(
    ({ texture, mask: textureMask, ...sprite }) => {
      const isSelected =
        texture.texture === selectedTexture && textureMask === selectedMask;
      const distance = isSelected ? selectedDistance : texture.distance;
      const clip = isSelected ? selectedClip : texture.clip;
      const textureLabel = formatSpriteTitle(texture.texture);
      const activateTexture = () => {
        setToolState<TextureToolState>(defaultTools.texture.id, {
          ...texture,
          mask: textureMask,
          distance,
          clip,
        });
      };

      return {
        key: `${textureMask}-${texture.texture}`,
        label: textureLabel,
        secondaryLabel: formatMaskTitle(textureMask),
        title: `${texture.texture} ${textureMask}`,
        previewSrc: sprite.maskedSrc ?? sprite.src,
        previewClassName: getTexturePreviewClassName(textureMask),
        width: sprite.width,
        height: sprite.height,
        distance,
        clip,
        defaultDistance: texture.distance,
        defaultClip: texture.clip,
        isSelected,
        onActivate: activateTexture,
        onDistanceChange: (distance: number) => {
          setToolState<TextureToolState>(defaultTools.texture.id, {
            ...texture,
            mask: textureMask,
            distance,
            clip,
          });
        },
        onClipChange: (clip: TextureToolState["clip"]) => {
          setToolState<TextureToolState>(defaultTools.texture.id, {
            ...texture,
            mask: textureMask,
            distance,
            clip,
          });
        },
        onResetDefaults: () => {
          setToolState<TextureToolState>(defaultTools.texture.id, {
            ...texture,
            mask: textureMask,
            distance: texture.distance,
            clip: texture.clip,
          });
        },
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
          <PictureIcon
            className={getTexturePreviewClassName(selectedMask)}
            src={textureSrc}
          />
        </ToolControlButton>
      }
    >
      <PictureTexturePicker
        items={pickerItems}
        maxSpriteDimension={maxTextureSpriteDimension}
      />
    </ToolControlMenu>
  );
}

function getTexturePreviewClassName(mask: Mask | "") {
  return mask === Mask.Litt ? "h-3 w-3" : "h-full w-full";
}

function formatMaskTitle(mask: Mask | "") {
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
      return "";
  }
}
