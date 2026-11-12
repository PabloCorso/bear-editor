import { useEffect, useRef, useState } from "react";
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
import {
  usePictureSprites,
  useTextureMaskSprites,
} from "~/components/use-lgr-assets";
import {
  Gravity,
  type AppleAnimation,
  type Picture,
} from "~/editor/elma-types";
import type { SelectTool } from "../tools/select-tool";
import {
  PictureTexturePicker,
  formatSpriteTitle,
} from "./picture-texture-picker";
import { PicturePropertiesToolbar } from "./picture-properties-toolbar";
import { defaultAppleState } from "../tools/apple-tools";

type ReplacementKind =
  | "apples"
  | "killers"
  | "flowers"
  | "pictures"
  | "textures"
  | "copied";
const selectClass =
  "h-9 rounded-md border border-default bg-screen px-2 text-sm";

/** Local settings remain drafts until Replace is clicked. */
export function ReplaceSelectionDialog({
  tool,
  onClose,
}: {
  tool: SelectTool;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ReplacementKind>("apples");
  const [apple, setApple] = useState(defaultAppleState);
  const [picture, setPicture] = useState<Omit<Picture, "position"> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const pictureSprites = usePictureSprites();
  const textureSprites = useTextureMaskSprites();
  useEffect(function cancelPendingClipboardOnUnmount() {
    return () => pending.current?.abort();
  }, []);
  const count = tool.getReplacementCount();
  const needsPicture = kind === "pictures" || kind === "textures";
  const sprites = kind === "textures" ? textureSprites : pictureSprites;
  const pickerItems =
    kind === "textures"
      ? textureSprites.map(({ texture, mask, ...sprite }) => ({
          key: `${texture.texture}-${mask}`,
          label: `${formatSpriteTitle(texture.texture)} ${mask.replace("mask", "")}`,
          previewSrc: sprite.maskedSrc ?? sprite.src,
          width: sprite.width,
          height: sprite.height,
          isSelected:
            picture?.texture === texture.texture && picture?.mask === mask,
          onActivate: () => setPicture({ name: "", ...texture, mask }),
        }))
      : pictureSprites.map(({ picture: asset, ...sprite }) => ({
          key: asset.name,
          label: formatSpriteTitle(asset.name),
          previewSrc: sprite.src,
          width: sprite.width,
          height: sprite.height,
          isSelected: picture?.name === asset.name,
          onActivate: () => setPicture({ ...asset, texture: "", mask: "" }),
        }));

  function close() {
    pending.current?.abort();
    onClose();
  }

  async function replace() {
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result =
        kind === "copied"
          ? await tool.replaceSelectionWithCopiedContent(controller.signal)
          : needsPicture
            ? picture
              ? tool.replaceSelectionWithPicture(picture)
              : "Choose a picture or texture."
            : tool.replaceSelectionWithObject(
                kind as "apples" | "killers" | "flowers",
                apple,
              );
      if (controller.signal.aborted) return;
      if (result) setError(result);
      else onClose();
    } catch {
      if (!controller.signal.aborted)
        setError("Could not replace the selection. Try again.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        <DialogHeader showCloseButton>
          <DialogTitle>Replace selection</DialogTitle>
        </DialogHeader>
        <DialogBody className="gap-4">
          <DialogDescription>
            Place one replacement at each selected vertex or element position (
            {count}). Selected originals are removed; the level start stays.
          </DialogDescription>
          <label className="flex items-center justify-between gap-3 text-sm">
            Replace with
            <select
              className={selectClass}
              value={kind}
              disabled={busy}
              onChange={(event) => {
                setKind(event.target.value as ReplacementKind);
                setPicture(null);
                setError(null);
              }}
            >
              <option value="apples">Apples</option>
              <option value="killers">Killers</option>
              <option value="flowers">Flowers</option>
              <option value="pictures">Picture</option>
              <option value="textures">Texture</option>
              <option value="copied">Copied content</option>
            </select>
          </label>
          {kind === "apples" && (
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm">
                Variant
                <select
                  className={selectClass}
                  value={apple.animation}
                  onChange={(event) =>
                    setApple({
                      ...apple,
                      animation: Number(event.target.value) as AppleAnimation,
                    })
                  }
                >
                  {Array.from({ length: 9 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                Gravity
                <select
                  className={selectClass}
                  value={apple.gravity}
                  onChange={(event) =>
                    setApple({
                      ...apple,
                      gravity: Number(event.target.value) as Gravity,
                    })
                  }
                >
                  {[
                    [Gravity.None, "None"],
                    [Gravity.Up, "Up"],
                    [Gravity.Down, "Down"],
                    [Gravity.Left, "Left"],
                    [Gravity.Right, "Right"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {needsPicture && (
            <>
              <div className="@container max-h-64 overflow-y-auto">
                <PictureTexturePicker
                  compact
                  maxColumns={4}
                  items={pickerItems}
                  maxSpriteDimension={Math.max(
                    1,
                    ...sprites.map((sprite) =>
                      Math.max(sprite.width ?? 0, sprite.height ?? 0),
                    ),
                  )}
                />
                {pickerItems.length === 0 && (
                  <p className="text-sm text-secondary">
                    No assets available in this LGR.
                  </p>
                )}
              </div>
              {picture && (
                <PicturePropertiesToolbar
                  distance={picture.distance}
                  clip={picture.clip}
                  onDistanceChange={(distance) =>
                    setPicture({ ...picture, distance })
                  }
                  onClipChange={(clip) => setPicture({ ...picture, clip })}
                />
              )}
            </>
          )}
          {kind === "copied" && (
            <p className="text-sm text-secondary">
              Copy an item or group in Bear first. Each copy keeps its size and
              layout, centred on a selected position.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="accent"
            disabled={busy || count === 0 || (needsPicture && !picture)}
            onClick={() => void replace()}
          >
            {busy ? "Reading clipboard…" : "Replace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
