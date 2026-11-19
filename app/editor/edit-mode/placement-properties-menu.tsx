import { useLgrAssets } from "~/components/use-lgr-assets";
import { Popover, PopoverContent } from "~/components/ui/popover";
import {
  useEditor,
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import { defaultTools } from "./tools/default-tools";
import { defaultAppleState, type AppleToolState } from "./tools/apple-tools";
import {
  defaultPictureState,
  type PictureToolState,
} from "./tools/picture-tool";
import {
  defaultTextureState,
  type TextureToolState,
} from "./tools/texture-tool";
import { PicturePropertiesToolbar } from "./toolbars/picture-properties-toolbar";
import { AppleToolbar } from "./toolbars/apple-tool-control";

export function PlacementPropertiesMenu() {
  const toolId = useEditor((state) => state.activeToolId);
  const isPlayMode = useEditor((state) => state.isPlayMode);
  const toolState = useEditorToolState<
    AppleToolState | PictureToolState | TextureToolState
  >(toolId);
  const { setToolState } = useEditorActions();
  const { lgr } = useLgrAssets();
  const menu = toolState?.propertiesMenu;

  if (
    isPlayMode ||
    !menu ||
    !toolState ||
    (toolId !== defaultTools.apple.id &&
      toolId !== defaultTools.picture.id &&
      toolId !== defaultTools.texture.id &&
      toolId !== defaultTools.color.id)
  )
    return null;

  const anchor = {
    getBoundingClientRect: () =>
      DOMRect.fromRect({
        x: menu.clientPosition.x,
        y: menu.clientPosition.y,
        width: 0,
        height: 0,
      }),
  };

  if (toolId === defaultTools.apple.id) {
    const appleToolState = toolState as AppleToolState;
    return (
      <Popover
        open
        modal={false}
        onOpenChange={(open) => {
          if (!open) setToolState(toolId, { propertiesMenu: undefined });
        }}
      >
        <PopoverContent
          anchor={anchor}
          positionMethod="fixed"
          side="top"
          align="center"
          initialFocus={false}
          finalFocus={false}
          className="z-50 outline-hidden"
        >
          <AppleToolbar
            role="group"
            tabIndex={-1}
            withShortcuts={false}
            currentAnimation={
              appleToolState.animation ?? defaultAppleState.animation
            }
            currentGravity={appleToolState.gravity ?? defaultAppleState.gravity}
            orientation="horizontal"
            onAnimationChange={(animation) =>
              setToolState(toolId, { animation })
            }
            onGravityChange={(gravity) => setToolState(toolId, { gravity })}
          />
        </PopoverContent>
      </Popover>
    );
  }

  const placementToolState = toolState as PictureToolState | TextureToolState;
  const defaults =
    "texture" in placementToolState
      ? (lgr
          .getTextureSprites()
          .find(({ texture }) => texture.texture === placementToolState.texture)
          ?.texture ?? defaultTextureState)
      : (lgr
          .getPictureSprites()
          .find(({ picture }) => picture.name === placementToolState.name)
          ?.picture ??
        lgr
          .getColorSprites()
          .find(({ picture }) => picture.name === placementToolState.name)
          ?.picture ??
        defaultPictureState);
  const title =
    toolId === defaultTools.texture.id
      ? "Texture properties"
      : toolId === defaultTools.color.id
        ? "Color properties"
        : "Picture properties";

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
        distance={placementToolState.distance}
        clip={placementToolState.clip}
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
