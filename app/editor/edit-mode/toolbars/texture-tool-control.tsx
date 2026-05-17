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
import { Toolbar } from "~/components/ui/toolbar";
import { cn } from "~/utils/misc";

export function TextureToolControl(props: ToolControlButtonProps) {
  const textureTool = useEditorToolState<TextureToolState>(
    defaultTools.texture.id,
  );
  const { setToolState } = useEditorActions();
  const textureSprites = useTextureMaskSprites();
  const selectedTexture = textureTool?.texture ?? defaultTextureState.texture;
  const selectedMask = textureTool?.mask ?? standardSprites.textureMasks[0];
  const selectedTextureSprite = textureSprites.find(
    ({ texture, mask }) =>
      texture.texture === selectedTexture && mask === selectedMask,
  );
  const textureSrc =
    selectedTextureSprite?.maskedSrc ?? selectedTextureSprite?.src;
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
      <div className="pointer-events-auto max-h-full overflow-y-auto">
        <Toolbar orientation="vertical">
          <ul className="flex flex-col gap-2.5">
            {standardSprites.textureMasks.map((mask) => (
              <li key={mask}>
                <ul className="flex flex-col gap-2.5">
                  {textureSprites
                    .filter((sprite) => sprite.mask === mask)
                    .map(({ texture, mask: textureMask, ...sprite }) => {
                      const isSelected =
                        texture.texture === selectedTexture &&
                        textureMask === selectedMask;

                      return (
                        <li key={`${textureMask}-${texture.texture}`}>
                          <button
                            className={cn(
                              "inline-flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded p-1.5 text-sm font-bold transition-colors hover:bg-primary-hover/80 active:bg-primary-active/80",
                              isSelected && "bg-primary-hover/50",
                            )}
                            aria-pressed={isSelected}
                            onClick={() => {
                              setToolState<TextureToolState>(
                                defaultTools.texture.id,
                                {
                                  ...texture,
                                  mask: textureMask,
                                },
                              );
                            }}
                            title={`${texture.texture} (${textureMask})`}
                          >
                            <PictureIcon
                              className={getTexturePreviewClassName(
                                textureMask,
                              )}
                              src={sprite.maskedSrc ?? sprite.src}
                            />
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </li>
            ))}
          </ul>
        </Toolbar>
      </div>
    </ToolControlMenu>
  );
}

function getTexturePreviewClassName(mask: Mask | "") {
  return mask === Mask.Litt ? "h-3 w-3" : "h-full w-full";
}
