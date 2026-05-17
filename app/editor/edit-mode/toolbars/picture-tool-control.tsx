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
import { Toolbar } from "~/components/ui/toolbar";
import { cn } from "~/utils/misc";

export function PictureToolControl(props: ToolControlButtonProps) {
  const pictureTool = useEditorToolState<PictureToolState>(
    defaultTools.picture.id,
  );
  const { setToolState } = useEditorActions();

  const selectedPictureName = pictureTool?.name ?? defaultPictureState.name;
  const sprite = useLgrSprite(selectedPictureName);
  const pictureSprites = usePictureSprites();
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
      <div className="pointer-events-auto max-h-full overflow-y-auto">
        <Toolbar orientation="vertical">
          <ul className="flex flex-col gap-2.5">
            {pictureSprites.map(({ picture, ...sprite }) => {
              const isSelected = picture.name === selectedPictureName;

              return (
                <li key={picture.name}>
                  <button
                    className={cn(
                      "inline-flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded p-1.5 text-sm font-bold transition-colors hover:bg-primary-hover/80 active:bg-primary-active/80",
                      isSelected && "bg-primary-hover/50",
                    )}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setToolState<PictureToolState>(
                        defaultTools.picture.id,
                        picture,
                      );
                    }}
                  >
                    <PictureIcon className="h-full w-full" src={sprite.src} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Toolbar>
      </div>
    </ToolControlMenu>
  );
}
