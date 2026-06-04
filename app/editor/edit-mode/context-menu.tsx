import {
  useEditorToolState,
  useEditorActions,
  useEditorActiveTool,
} from "~/editor/use-editor-store";
import {
  SelectTool,
  type SelectToolState,
} from "~/editor/edit-mode/tools/select-tool";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import { AppleToolbar } from "~/editor/edit-mode/toolbars/apple-tool-control";
import { PicturePropertiesToolbar } from "~/editor/edit-mode/toolbars/picture-properties-toolbar";
import { VertexContextMenuToolbar } from "~/editor/edit-mode/toolbars/vertex-tool-control";
import { OBJECT_DIAMETER } from "~/editor/constants";
import { worldToScreen } from "~/editor/helpers/coordinate-helpers";
import { useEditor } from "~/editor/use-editor-store";
import { Popover, PopoverContent } from "~/components/ui/popover";
import type { Picture, Position } from "~/editor/elma-types";

const TOOLBAR_OFFSET_PX = 12;
const TOOLBAR_COLLISION_PADDING_PX = 8;

type PointAnchor = {
  getBoundingClientRect: () => DOMRect;
};

export function EditorContextMenu() {
  const { updateApple, setPictures, setPolygons } = useEditorActions();
  const selectToolState = useEditorToolState<SelectToolState>(
    defaultTools.select.id,
  );
  const selectTool = useEditorActiveTool<SelectTool>();
  const viewPortOffset = useEditor((state) => state.viewPortOffset);
  const zoom = useEditor((state) => state.zoom);
  const polygons = useEditor((state) => state.polygons);
  const pictures = useEditor((state) => state.pictures);

  const contextMenuType = selectToolState?.contextMenuType;
  if (!contextMenuType) return null;

  const selectedApple = selectToolState.selectedObjects[0];
  const selectedPolygon = selectToolState.selectedVertices[0]?.polygon;
  const selectedPicturePosition = selectToolState.selectedPictures[0];
  const selectedPicture = selectedPicturePosition
    ? findPictureByPosition(pictures, selectedPicturePosition)
    : null;

  if (contextMenuType === "apple" && !selectedApple) return null;
  if (contextMenuType === "vertex" && !selectedPolygon) return null;
  if (contextMenuType === "picture" && !selectedPicture) return null;

  const canvas =
    typeof document === "undefined" ? null : document.querySelector("canvas");
  const collisionBoundary = canvas ?? undefined;

  const anchorPosition =
    contextMenuType === "apple" &&
    selectedApple &&
    typeof viewPortOffset?.x === "number" &&
    typeof viewPortOffset?.y === "number" &&
    typeof zoom === "number"
      ? worldToScreen(
          { ...selectedApple, y: selectedApple.y - OBJECT_DIAMETER / 2 },
          viewPortOffset,
          zoom,
        )
      : (selectToolState.contextMenuPosition ?? { x: 0, y: 0 });

  const anchor =
    contextMenuType === "apple" && typeof zoom === "number"
      ? createRectAnchor(anchorPosition, canvas, {
          width: 0,
          height: OBJECT_DIAMETER * zoom,
        })
      : createRectAnchor(anchorPosition, canvas, { width: 0, height: 0 });

  return (
    <Popover open modal={false}>
      {contextMenuType === "apple" ? (
        <PopoverContent
          anchor={anchor}
          positionMethod="fixed"
          initialFocus={(openType) => openType === "keyboard"}
          finalFocus={false}
          side="top"
          align="center"
          sideOffset={TOOLBAR_OFFSET_PX}
          collisionBoundary={collisionBoundary}
          collisionPadding={TOOLBAR_COLLISION_PADDING_PX}
          collisionAvoidance={{
            side: "flip",
            align: "shift",
            fallbackAxisSide: "none",
          }}
          className="z-50 outline-hidden"
        >
          <AppleToolbar
            tabIndex={-1}
            withShortcuts={false}
            orientation="horizontal"
            onAnimationChange={(animation) => {
              updateApple({ position: selectedApple, animation });
              selectTool?.clear();
            }}
            onGravityChange={(gravity) => {
              updateApple({ position: selectedApple, gravity });
              selectTool?.clear();
            }}
          />
        </PopoverContent>
      ) : null}
      {contextMenuType === "vertex" && selectedPolygon ? (
        <PopoverContent
          anchor={anchor}
          positionMethod="fixed"
          initialFocus={(openType) => openType === "keyboard"}
          finalFocus={false}
          side="top"
          align="start"
          sideOffset={TOOLBAR_OFFSET_PX}
          collisionBoundary={collisionBoundary}
          collisionPadding={TOOLBAR_COLLISION_PADDING_PX}
          collisionAvoidance={{
            side: "flip",
            align: "shift",
            fallbackAxisSide: "none",
          }}
          className="z-50 outline-hidden"
        >
          <VertexContextMenuToolbar
            tabIndex={-1}
            onGrassToggle={() => {
              const polygonIndex = polygons.indexOf(selectedPolygon);
              if (polygonIndex === -1) return;
              setPolygons(
                polygons.map((polygon, index) =>
                  index === polygonIndex
                    ? { ...polygon, grass: !polygon.grass }
                    : polygon,
                ),
              );
              selectTool?.clear();
            }}
          />
        </PopoverContent>
      ) : null}
      {contextMenuType === "picture" && selectedPicture ? (
        <PopoverContent
          anchor={anchor}
          positionMethod="fixed"
          initialFocus={(openType) => openType === "keyboard"}
          finalFocus={false}
          side="top"
          align="center"
          sideOffset={TOOLBAR_OFFSET_PX}
          collisionBoundary={collisionBoundary}
          collisionPadding={TOOLBAR_COLLISION_PADDING_PX}
          collisionAvoidance={{
            side: "flip",
            align: "shift",
            fallbackAxisSide: "none",
          }}
          className="z-50 outline-hidden"
        >
          <PicturePropertiesToolbar
            tabIndex={-1}
            distance={selectedPicture.distance}
            clip={selectedPicture.clip}
            onDistanceChange={(distance) => {
              setPictures(
                pictures.map((picture) =>
                  picture === selectedPicture
                    ? { ...picture, distance }
                    : picture,
                ),
              );
            }}
            onClipChange={(clip) => {
              setPictures(
                pictures.map((picture) =>
                  picture === selectedPicture ? { ...picture, clip } : picture,
                ),
              );
            }}
          />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

function findPictureByPosition(pictures: Picture[], position: Position) {
  return pictures.find((picture) => picture.position === position) ?? null;
}

function createRectAnchor(
  position: Position,
  canvas: HTMLCanvasElement | null,
  size: { width: number; height: number },
): PointAnchor {
  const canvasRect = canvas?.getBoundingClientRect();
  const left = (canvasRect?.left ?? 0) + position.x;
  const top = (canvasRect?.top ?? 0) + position.y;

  return {
    getBoundingClientRect() {
      return DOMRect.fromRect({
        x: left,
        y: top,
        width: size.width,
        height: size.height,
      });
    },
  };
}
