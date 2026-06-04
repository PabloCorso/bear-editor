import {
  useEditorActions,
  useEditorToolState,
} from "~/editor/use-editor-store";
import { PictureIcon } from "~/components/sprite-icon";
import {
  ToolControlButton,
  ToolControlMenu,
  type ToolControlButtonProps,
} from "./tool";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import { useLgrSprite, usePictureSprites } from "~/components/use-lgr-assets";
import {
  defaultPictureState,
  type PictureToolState,
} from "~/editor/edit-mode/tools/picture-tool";
import {
  capitalizeSpriteName,
  PictureTexturePicker,
} from "./picture-texture-picker";

export function PictureToolControl(props: ToolControlButtonProps) {
  const pictureTool = useEditorToolState<PictureToolState>(
    defaultTools.picture.id,
  );
  const { setToolState } = useEditorActions();

  const selectedPictureName = pictureTool?.name ?? defaultPictureState.name;
  const sprite = useLgrSprite(selectedPictureName);
  const pictureSprites = usePictureSprites();
  const maxPictureSpriteDimension = Math.max(
    ...pictureSprites.map(({ width = 0, height = 0 }) =>
      Math.max(width, height),
    ),
    1,
  );
  const selectedDistance =
    pictureTool?.distance ?? defaultPictureState.distance;
  const selectedClip = pictureTool?.clip ?? defaultPictureState.clip;
  const pickerItems = pictureSprites.map(({ picture, ...sprite }) => {
    const isSelected = picture.name === selectedPictureName;
    const distance = isSelected ? selectedDistance : picture.distance;
    const clip = isSelected ? selectedClip : picture.clip;
    const pictureLabel = capitalizeSpriteName(picture.name);
    const activatePicture = () => {
      setToolState<PictureToolState>(defaultTools.picture.id, {
        ...picture,
        distance,
        clip,
      });
    };

    return {
      key: picture.name,
      label: pictureLabel,
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
        setToolState<PictureToolState>(defaultTools.picture.id, {
          ...picture,
          distance,
          clip,
        });
      },
      onClipChange: (clip: PictureToolState["clip"]) => {
        setToolState<PictureToolState>(defaultTools.picture.id, {
          ...picture,
          distance,
          clip,
        });
      },
      onResetDefaults: () => {
        setToolState<PictureToolState>(defaultTools.picture.id, {
          ...picture,
          distance: picture.distance,
          clip: picture.clip,
        });
      },
    };
  });

  return (
    <ToolControlMenu
      id={defaultTools.picture.id}
      button={
        <ToolControlButton
          isLoading={!sprite.src}
          {...defaultTools.picture}
          {...props}
        >
          <PictureIcon src={sprite.src} />
        </ToolControlButton>
      }
    >
      <PictureTexturePicker
        items={pickerItems}
        maxSpriteDimension={maxPictureSpriteDimension}
      />
    </ToolControlMenu>
  );
}
