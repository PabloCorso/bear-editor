import {
  useEditorActions,
  useEditor,
  useEditorToolState,
  useEditorActiveTool,
} from "~/editor/use-editor-store";
import { PictureIcon } from "~/components/sprite-icon";
import {
  ToolControlButton,
  ToolControlMenu,
  type ToolControlButtonProps,
} from "./tool";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import {
  useLgrAssets,
  useLgrSprite,
  usePictureSprites,
} from "~/components/use-lgr-assets";
import type { SceneryFillToolState } from "../tools/scenery-fill-tool";
import {
  defaultPictureState,
  type PictureToolState,
} from "~/editor/edit-mode/tools/picture-tool";
import {
  formatSpriteTitle,
  PictureTexturePicker,
} from "./picture-texture-picker";

export function PictureToolControl(props: ToolControlButtonProps) {
  const pictureTool = useEditorToolState<PictureToolState>(
    defaultTools.picture.id,
  );
  const { setToolState, activateTool, setToolMenuOpen } = useEditorActions();
  const activeTool = useEditorActiveTool();
  const fillMode = activeTool?.meta.id === defaultTools.pictureFill.id;
  const isActive = fillMode || activeTool?.meta.id === defaultTools.picture.id;
  const fillTool = useEditorToolState<SceneryFillToolState>(
    defaultTools.pictureFill.id,
  );
  const pictures = useEditor((state) => state.pictures);
  const lgrAssets = useLgrAssets();

  const selectedPictureName =
    (fillMode ? fillTool?.name : pictureTool?.name) ??
    pictureTool?.name ??
    defaultPictureState.name;
  const defaultSprite = useLgrSprite(defaultPictureState.name);
  const pictureSprites = [...usePictureSprites()];
  for (const picture of pictures) {
    if (
      !picture.name ||
      /^zz[0-9a-f]{6}$/i.test(picture.name) ||
      pictureSprites.some((s) => s.picture.name === picture.name)
    )
      continue;
    pictureSprites.push({
      picture: {
        name: picture.name,
        distance: picture.distance,
        clip: picture.clip,
      },
      src: undefined,
      width: 0,
      height: 0,
    });
  }
  const maxPictureSpriteDimension = Math.max(
    ...pictureSprites.map(({ width = 0, height = 0 }) =>
      Math.max(width, height),
    ),
    1,
  );
  const selectedDistance =
    (fillMode ? fillTool?.distance : pictureTool?.distance) ??
    defaultPictureState.distance;
  const selectedClip =
    (fillMode ? fillTool?.clip : pictureTool?.clip) ??
    defaultPictureState.clip;

  function updatePicture(next: Pick<PictureToolState, "name" | "distance" | "clip">) {
    if (fillMode) {
      setToolState<SceneryFillToolState>(defaultTools.pictureFill.id, next);
    } else {
      setToolState<PictureToolState>(defaultTools.picture.id, next);
    }
  }

  function switchMode(nextFillMode: boolean) {
    const next = {
      name: selectedPictureName,
      distance: selectedDistance,
      clip: selectedClip,
    };
    if (nextFillMode) {
      setToolState<SceneryFillToolState>(defaultTools.pictureFill.id, next);
      activateTool(defaultTools.pictureFill.id);
      setToolMenuOpen(true, defaultTools.picture.id);
    } else {
      setToolState<PictureToolState>(defaultTools.picture.id, next);
      activateTool(defaultTools.picture.id);
      setToolMenuOpen(true, defaultTools.picture.id);
    }
  }

  const modePicker = (
    <div className="flex items-center gap-1 rounded-md border border-default p-0.5" role="group" aria-label="Picture application mode">
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
        title="Repeat pictures across a polygon. Boundary tiles may extend beyond it."
      >
        Fill
      </button>
    </div>
  );
  const pickerItems = pictureSprites.map(({ picture, ...sprite }) => {
    const isSelected = picture.name === selectedPictureName;
    const distance = isSelected ? selectedDistance : picture.distance;
    const clip = isSelected ? selectedClip : picture.clip;
    const pictureLabel = formatSpriteTitle(picture.name);
    const activatePicture = () => {
      updatePicture({ name: picture.name, distance, clip });
    };

    return {
      key: picture.name,
      label: pictureLabel,
      title: picture.name,
      previewSrc: sprite.src,
      width: sprite.width,
      height: sprite.height,
      distance,
      clip,
      defaultDistance: picture.distance,
      defaultClip: picture.clip,
      isSelected,
      onActivate: activatePicture,
      onDistanceChange: (distance: number) => {
        updatePicture({ name: picture.name, distance, clip });
      },
      onClipChange: (clip: PictureToolState["clip"]) => {
        updatePicture({ name: picture.name, distance, clip });
      },
      onResetDefaults: () => {
        updatePicture({ name: picture.name, distance: picture.distance, clip: picture.clip });
      },
    };
  });

  return (
    <ToolControlMenu
      id={defaultTools.picture.id}
      button={
        <ToolControlButton
          isLoading={!lgrAssets.isLoaded}
          {...defaultTools.picture}
          {...props}
          id={undefined}
          isActive={isActive}
          onClick={() => {
            if (!isActive) activateTool(defaultTools.picture.id);
          }}
        >
          <PictureIcon src={defaultSprite.src} />
        </ToolControlButton>
      }
    >
      <PictureTexturePicker
        header={modePicker}
        items={pickerItems}
        maxSpriteDimension={maxPictureSpriteDimension}
      />
    </ToolControlMenu>
  );
}
