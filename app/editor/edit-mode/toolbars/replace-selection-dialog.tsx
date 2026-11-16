import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectTriggerIcon,
  SelectValue,
} from "~/components/ui/select";
import { SpriteIcon } from "~/components/sprite-icon";
import { AppleArrowIcon } from "./apple-tool-control";
import { ColorPaletteSwitch } from "./color-palette-switch";
import { PickerOptionButton } from "./picker-option-button";
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
  useTextureSprites,
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

type ObjectKind = "apples" | "killers" | "flowers";
type ReplacementKind = "object" | "pictures" | "textures" | "colors" | "copied";
const materialKinds = [
  { value: "pictures", label: "Picture" },
  { value: "textures", label: "Texture" },
  { value: "colors", label: "Color" },
] as const;
const replacementKinds: { value: ReplacementKind; label: string }[] = [
  { value: "object", label: "Object" },
  ...materialKinds,
  { value: "copied", label: "Clipboard" },
];
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
  mode = "replace",
  onClose,
}: {
  tool: SelectTool;
  mode?: "replace" | "fill";
  onClose: () => void;
}) {
  const isFill = mode === "fill";
  const title = isFill ? "Fill" : "Replace";
  const kinds = isFill ? materialKinds : replacementKinds;
  const [kind, setKind] = useState<ReplacementKind>(
    isFill ? "pictures" : "object",
  );
  const [objectKind, setObjectKind] = useState<ObjectKind>("apples");
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
  const selectedAppleSrc =
    appleSprites.find(({ animation }) => animation === apple.animation)?.src ??
    appleIcon.src;
  const objects = [
    { kind: "apples", label: "Apple", src: selectedAppleSrc },
    { kind: "killers", label: "Killer", src: killerIcon.src },
    { kind: "flowers", label: "Flower", src: flowerIcon.src },
  ] as const;
  const fillTextures = useTextureSprites();
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
      ? isFill
        ? fillTextures
        : textureSprites
      : kind === "colors"
        ? colorSprites
        : pictureSprites;
  const pickerItems =
    kind === "textures"
      ? isFill
        ? fillTextures.map(({ texture, src, width, height }) => ({
            key: texture.texture,
            label: formatSpriteTitle(texture.texture),
            previewSrc: src,
            width,
            height,
            isSelected: picture?.texture === texture.texture,
            onActivate: () => setPicture({ name: "", ...texture }),
          }))
        : textureSprites.map(({ texture, mask, ...sprite }) => ({
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
      const result = needsPicture
        ? picture
          ? isFill
            ? tool.fillSelectedPolygons(kind, picture)
            : tool.replaceSelectionWithPicture(picture)
          : "Choose a material."
        : kind === "copied"
          ? await tool.replaceSelectionWithCopiedContent(controller.signal)
          : tool.replaceSelectionWithObject(objectKind, apple);
      if (controller.signal.aborted) return;
      if (result) setError(result);
      else onClose();
    } catch {
      if (!controller.signal.aborted)
        setError(`Could not ${mode} the selection. Try again.`);
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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="gap-3">
          <Select
            items={kinds}
            value={kind}
            onValueChange={(value) => {
              if (!value || value === kind) return;
              setKind(value);
              setPicture(null);
              setError(null);
            }}
            disabled={busy}
          >
            <SelectTrigger aria-label="Type" className="self-start">
              <SelectValue />
              <SelectTriggerIcon />
            </SelectTrigger>
            <SelectContent>
              {kinds.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {kind === "object" && (
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label="Object"
            >
              {objects.map(({ kind, label, src }) => (
                <PickerOptionButton
                  key={kind}
                  label={label}
                  selected={objectKind === kind}
                  onClick={() => {
                    setObjectKind(kind);
                    setError(null);
                  }}
                >
                  <SpriteIcon src={src} />
                </PickerOptionButton>
              ))}
            </div>
          )}
          {kind === "object" && objectKind === "apples" && (
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
                    <span className="relative block" aria-hidden="true">
                      <SpriteIcon
                        className="block h-full w-full"
                        src={selectedAppleSrc}
                      />
                      <AppleArrowIcon gravity={gravity} />
                    </span>
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
            disabled={
              busy || (!isFill && count === 0) || (needsPicture && !picture)
            }
            onClick={() => void replace()}
          >
            {busy && kind === "copied" ? "Reading clipboard…" : title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
