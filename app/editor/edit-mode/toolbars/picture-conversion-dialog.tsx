import { useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { useLgrAssets, useTextureSprites } from "~/components/use-lgr-assets";
import type { Picture } from "~/editor/elma-types";
import type { SelectTool } from "../tools/select-tool";
import {
  formatSpriteTitle,
  PictureTexturePicker,
} from "./picture-texture-picker";
import { PicturePropertiesToolbar } from "./picture-properties-toolbar";

type TextureChoice = Pick<Picture, "texture" | "distance" | "clip">;

export function PictureConversionDialog({
  tool,
  onClose,
}: {
  tool: SelectTool;
  onClose: () => void;
}) {
  const { lgr, isLoaded } = useLgrAssets();
  const textures = useTextureSprites();
  const source = tool.getSelectedPictureForConversion();
  const [mode, setMode] = useState<"polygon" | "textured">("polygon");
  const [chosen, setChosen] = useState<TextureChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = textures.map(({ texture, src, width, height }) => {
    const active = chosen?.texture === texture.texture;
    const distance = active ? chosen.distance : texture.distance;
    const clip = active ? chosen.clip : texture.clip;
    const update = (patch: Partial<TextureChoice> = {}) =>
      setChosen({ texture: texture.texture, distance, clip, ...patch });
    return {
      key: texture.texture,
      label: formatSpriteTitle(texture.texture),
      previewSrc: src,
      width,
      height,
      isSelected: active,
      distance,
      clip,
      defaultDistance: texture.distance,
      defaultClip: texture.clip,
      onActivate: () => update(),
      onDistanceChange: (distance: number) => update({ distance }),
      onClipChange: (clip: Picture["clip"]) => update({ clip }),
      onResetDefaults: () =>
        update({ distance: texture.distance, clip: texture.clip }),
    };
  });

  function convert() {
    setError(null);
    const result = tool.convertSelectedPicture(
      lgr,
      mode === "textured" ? (chosen ?? undefined) : undefined,
    );
    if (result) setError(result);
    else onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader showCloseButton>
          <DialogTitle>Convert picture</DialogTitle>
        </DialogHeader>
        <DialogBody className="gap-4">
          <DialogDescription>
            Trace the visible outline of{" "}
            {source?.name ?? "the selected picture"}
            into editable physical polygons. The original image is replaced.
          </DialogDescription>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Conversion result"
          >
            <button
              type="button"
              aria-pressed={mode === "polygon"}
              className={`rounded-md border border-default px-3 py-2 text-sm ${mode === "polygon" ? "bg-primary-hover/50" : "hover:bg-primary-hover/30"}`}
              onClick={() => {
                setMode("polygon");
                setError(null);
              }}
            >
              Polygon
            </button>
            <button
              type="button"
              aria-pressed={mode === "textured"}
              className={`rounded-md border border-default px-3 py-2 text-sm ${mode === "textured" ? "bg-primary-hover/50" : "hover:bg-primary-hover/30"}`}
              onClick={() => {
                setMode("textured");
                setError(null);
              }}
            >
              Polygon + texture
            </button>
          </div>
          {mode === "textured" && (
            <>
              <p className="text-xs text-secondary">
                Pick a texture to fill the new polygons with standard LGR masks.
                Texture mask edges can extend slightly beyond the traced shape.
              </p>
              <div className="@container max-h-64 min-h-0 overflow-y-auto">
                <PictureTexturePicker
                  compact
                  maxColumns={4}
                  items={items}
                  maxSpriteDimension={Math.max(
                    1,
                    ...textures.map((sprite) =>
                      Math.max(sprite.width ?? 0, sprite.height ?? 0),
                    ),
                  )}
                />
              </div>
              {chosen && (
                <PicturePropertiesToolbar
                  distance={chosen.distance}
                  clip={chosen.clip}
                  onDistanceChange={(distance) =>
                    setChosen({ ...chosen, distance })
                  }
                  onClipChange={(clip) => setChosen({ ...chosen, clip })}
                />
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            disabled={!source || !isLoaded || (mode === "textured" && !chosen)}
            onClick={convert}
          >
            Convert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
