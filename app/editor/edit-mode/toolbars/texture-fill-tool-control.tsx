import { PaintBucketIcon } from "@phosphor-icons/react/dist/ssr";
import { useTextureSprites } from "~/components/use-lgr-assets";
import {
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import { defaultTools } from "../tools/default-tools";
import { defaultTextureState } from "../tools/texture-tool";
import type { TextureFillToolState } from "../tools/texture-fill-tool";
import {
  ToolControlButton,
  ToolControlMenu,
  type ToolControlButtonProps,
} from "./tool";
import {
  formatSpriteTitle,
  PictureTexturePicker,
} from "./picture-texture-picker";

export function TextureFillToolControl(props: ToolControlButtonProps) {
  const current =
    useEditorToolState<TextureFillToolState>(defaultTools.textureFill.id) ??
    defaultTextureState;
  const { setToolState } = useEditorActions();
  const sprites = useTextureSprites();
  const items = sprites.map(({ texture, src, width, height }) => {
    const isSelected = texture.texture === current.texture;
    const { distance, clip } = isSelected ? current : texture;
    const update = (patch: Partial<TextureFillToolState> = {}) =>
      setToolState<TextureFillToolState>(defaultTools.textureFill.id, {
        texture: texture.texture,
        distance,
        clip,
        ...patch,
      });
    return {
      key: texture.texture,
      label: formatSpriteTitle(texture.texture),
      previewSrc: src,
      width,
      height,
      distance,
      clip,
      defaultDistance: texture.distance,
      defaultClip: texture.clip,
      isSelected,
      onActivate: () => update(),
      onDistanceChange: (distance: number) => update({ distance }),
      onClipChange: (clip: TextureFillToolState["clip"]) => update({ clip }),
      onResetDefaults: () =>
        update({ distance: texture.distance, clip: texture.clip }),
    };
  });
  return (
    <ToolControlMenu
      id={defaultTools.textureFill.id}
      button={
        <ToolControlButton {...defaultTools.textureFill} {...props}>
          <PaintBucketIcon weight="light" />
        </ToolControlButton>
      }
    >
      <PictureTexturePicker
        items={items}
        maxSpriteDimension={Math.max(
          1,
          ...sprites.map((s) => Math.max(s.width ?? 0, s.height ?? 0)),
        )}
      />
    </ToolControlMenu>
  );
}
