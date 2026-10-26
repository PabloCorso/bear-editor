import { useLgrAssets } from "~/components/use-lgr-assets";
import { Popover } from "~/components/ui/popover";
import {
  useEditor,
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import { defaultTools } from "./tools/default-tools";
import {
  defaultPictureState,
  type PictureToolState,
} from "./tools/picture-tool";
import {
  defaultTextureState,
  type TextureToolState,
} from "./tools/texture-tool";
import { PicturePropertiesToolbar } from "./toolbars/picture-properties-toolbar";

export function PlacementPropertiesMenu() {
  const toolId = useEditor((state) => state.activeToolId);
  const isPlayMode = useEditor((state) => state.isPlayMode);
  const toolState = useEditorToolState<PictureToolState | TextureToolState>(
    toolId,
  );
  const { setToolState } = useEditorActions();
  const { lgr } = useLgrAssets();
  const menu = toolState?.propertiesMenu;

  if (
    isPlayMode ||
    !menu ||
    !toolState ||
    (toolId !== defaultTools.picture.id &&
      toolId !== defaultTools.texture.id &&
      toolId !== defaultTools.color.id)
  )
    return null;

  const defaults =
    "texture" in toolState
      ? (lgr
          .getTextureSprites()
          .find(({ texture }) => texture.texture === toolState.texture)
          ?.texture ?? defaultTextureState)
      : (lgr
          .getPictureSprites()
          .find(({ picture }) => picture.name === toolState.name)?.picture ??
        lgr
          .getColorSprites()
          .find(({ picture }) => picture.name === toolState.name)?.picture ??
        defaultPictureState);
  const title =
    toolId === defaultTools.texture.id
      ? "Texture properties"
      : toolId === defaultTools.color.id
        ? "Color properties"
        : "Picture properties";
  const anchor = {
    getBoundingClientRect: () =>
      DOMRect.fromRect({
        x: menu.clientPosition.x,
        y: menu.clientPosition.y,
        width: 0,
        height: 0,
      }),
  };

  return (
    <Popover
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) setToolState(toolId, { propertiesMenu: undefined });
      }}
    >
      <PicturePropertiesToolbar
        variant="popover-content"
        propertiesTitle={title}
        distance={toolState.distance}
        clip={toolState.clip}
        defaultDistance={defaults.distance}
        defaultClip={defaults.clip}
        onDistanceChange={(distance) => setToolState(toolId, { distance })}
        onClipChange={(clip) => setToolState(toolId, { clip })}
        onResetDefaults={() =>
          setToolState(toolId, {
            distance: defaults.distance,
            clip: defaults.clip,
          })
        }
        popoverContentProps={{
          anchor,
          positionMethod: "fixed",
          side: "right",
          align: "start",
          initialFocus: false,
          finalFocus: false,
        }}
      />
    </Popover>
  );
}
