import { ClipboardIcon, ImageIcon } from "@phosphor-icons/react";
import { SpriteIcon } from "~/components/sprite-icon";
import { ToolbarSeparator } from "~/components/ui/toolbar";
import { AppleArrowIcon } from "./apple-tool-control";
import { ColorPaletteSwitch } from "./color-palette-switch";
import { ColorToolIcon } from "./color-tool-control";
import { PickerOptionButton } from "./picker-option-button";
import { defaultTextureState } from "../tools/texture-tool";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import {
  usePictureSprites,
  useTextureMaskSprites,
  useLgrAssets,
  useLgrSprite,
  useAppleSprites,
} from "~/components/use-lgr-assets";
import { Gravity, type Picture } from "~/editor/elma-types";
import type { SelectTool } from "../tools/select-tool";
import {
  PictureTexturePicker,
  formatSpriteTitle,
} from "./picture-texture-picker";
import { PicturePropertiesToolbar } from "./picture-properties-toolbar";
import { defaultAppleState } from "../tools/apple-tools";
import { getColorPalette } from "./color-palette";

type ReplacementKind =
  | "apples"
  | "killers"
  | "flowers"
  | "pictures"
  | "textures"
  | "colors"
  | "copied";
const gravityOptions = [
  { gravity: Gravity.None, label: "No gravity" },
  { gravity: Gravity.Down, label: "Gravity down" },
  { gravity: Gravity.Left, label: "Gravity left" },
  { gravity: Gravity.Up, label: "Gravity up" },
  { gravity: Gravity.Right, label: "Gravity right" },
];

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
  const { lgr, isLoaded } = useLgrAssets();
  const [showAllColors, setShowAllColors] = useState(false);
  const appleSprites = useAppleSprites();
  const appleIcon = useLgrSprite("qfood1");
  const killerIcon = useLgrSprite("qkiller");
  const flowerIcon = useLgrSprite("qexit");
  const textureIcon = textureSprites.find(
    ({ texture, mask }) =>
      texture.texture === defaultTextureState.texture &&
      mask === defaultTextureState.mask,
  );
  const { ordered, baseNames } = useMemo(
    () => getColorPalette(lgr.getColorSprites()),
    // Assets load into the same LGR instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lgr, isLoaded],
  );
  useEffect(function cancelPendingClipboardOnUnmount() {
    return () => pending.current?.abort();
  }, []);
  const count = tool.getReplacementCount();
  const needsPicture =
    kind === "pictures" || kind === "textures" || kind === "colors";
  const colorSprites = showAllColors
    ? ordered
    : ordered.filter(
        ({ picture: color }) =>
          baseNames.has(color.name) || color.name === picture?.name,
      );
  const sprites =
    kind === "textures"
      ? textureSprites
      : kind === "colors"
        ? colorSprites
        : pictureSprites;
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
      : kind === "colors"
        ? colorSprites.map(({ picture: asset, rgb, width, height }) => ({
            key: asset.name,
            label: asset.name,
            title: `#${rgb
              .map((v) => v.toString(16).padStart(2, "0"))
              .join("")
              .toUpperCase()}`,
            previewSrc: lgr.getSpritePreview(asset.name),
            width,
            height,
            isSelected: picture?.name === asset.name,
            onActivate: () => setPicture({ ...asset, texture: "", mask: "" }),
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

  function option(
    value: ReplacementKind,
    label: string,
    icon: React.ReactNode,
  ) {
    return (
      <PickerOptionButton
        label={label}
        selected={kind === value}
        disabled={busy}
        onClick={() => {
          if (kind === value) return;
          setKind(value);
          setPicture(null);
          setError(null);
        }}
      >
        {icon}
      </PickerOptionButton>
    );
  }

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
              : "Choose a replacement."
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
          <DialogTitle>Replace</DialogTitle>
        </DialogHeader>
        <DialogBody className="gap-3">
          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="Replace with"
          >
            <div
              className="flex items-center gap-1"
              role="group"
              aria-label="Objects"
            >
              {option("apples", "Apple", <SpriteIcon src={appleIcon.src} />)}
              {option("killers", "Killer", <SpriteIcon src={killerIcon.src} />)}
              {option("flowers", "Flower", <SpriteIcon src={flowerIcon.src} />)}
            </div>
            <ToolbarSeparator />
            {option("pictures", "Picture", <ImageIcon aria-hidden="true" />)}
            {option(
              "textures",
              "Texture",
              <SpriteIcon src={textureIcon?.maskedSrc ?? textureIcon?.src} />,
            )}
            {option("colors", "Color", <ColorToolIcon aria-hidden="true" />)}
            <ToolbarSeparator />
            {option(
              "copied",
              "Copied content",
              <ClipboardIcon aria-hidden="true" />,
            )}
          </div>
          {kind === "apples" && (
            <>
              <div
                className="flex flex-wrap gap-1"
                role="group"
                aria-label="Apple animation"
              >
                {appleSprites.map(({ animation, src }) => (
                  <PickerOptionButton
                    key={animation}
                    label={`Apple animation ${animation}`}
                    selected={apple.animation === animation}
                    onClick={() => setApple({ ...apple, animation })}
                  >
                    <SpriteIcon src={src} />
                  </PickerOptionButton>
                ))}
              </div>
              <div
                className="flex flex-wrap gap-1"
                role="group"
                aria-label="Gravity"
              >
                {gravityOptions.map(({ gravity, label }) => (
                  <PickerOptionButton
                    key={gravity}
                    label={label}
                    selected={apple.gravity === gravity}
                    onClick={() => setApple({ ...apple, gravity })}
                  >
                    <SpriteIcon src={appleIcon.src} />
                    <AppleArrowIcon gravity={gravity} aria-hidden="true" />
                  </PickerOptionButton>
                ))}
              </div>
            </>
          )}
          {needsPicture && (
            <>
              <div className="flex items-center gap-2">
                {kind === "colors" && ordered.length > baseNames.size && (
                  <ColorPaletteSwitch
                    count={ordered.length}
                    checked={showAllColors}
                    onCheckedChange={setShowAllColors}
                  />
                )}
                {picture && (
                  <PicturePropertiesToolbar
                    className="ml-auto w-auto"
                    variant="summary-popover"
                    distance={picture.distance}
                    clip={picture.clip}
                    onDistanceChange={(distance) =>
                      setPicture({ ...picture, distance })
                    }
                    onClipChange={(clip) => setPicture({ ...picture, clip })}
                  />
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                <PictureTexturePicker
                  embedded
                  compact={kind === "colors"}
                  maxColumns={showAllColors && kind === "colors" ? 6 : 4}
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
            </>
          )}
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
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
