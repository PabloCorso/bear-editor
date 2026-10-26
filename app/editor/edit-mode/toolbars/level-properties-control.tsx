import { useState } from "react";
import { ToolbarButton } from "~/components/ui/toolbar";
import { cn } from "~/utils/misc";
import { useLgrAssets, useTextureSprites } from "~/components/use-lgr-assets";
import { PictureIcon } from "~/components/sprite-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { IconButton } from "~/components/ui/button";
import { useEditor, useEditorActions } from "~/editor/use-editor-store";
import {
  FloatingToolbar,
  FloatingToolbarAnchor,
  FloatingToolbarContent,
  FloatingToolbarPanel,
  FloatingToolbarTrigger,
} from "./floating-toolbar";
import { LgrSelect } from "~/components/lgr-select";

export function LevelPropertiesControl() {
  const [open, setOpen] = useState(false);
  const { setGround, setLgr, setSky } = useEditorActions();
  const lgrAssets = useLgrAssets();

  const textureSprites = useTextureSprites();
  const groundTexture = useEditor((state) => state.ground);
  const levelLgrName = useEditor((state) => state.lgr);
  const skyTexture = useEditor((state) => state.sky);
  const pictures = useEditor((state) => state.pictures);
  const allTextures = [
    ...new Set([
      ...textureSprites.map(({ texture }) => texture.texture),
      groundTexture,
      skyTexture,
    ]),
  ];
  const missingAssets = lgrAssets.isLoaded
    ? [
        ...new Set(
          [
            groundTexture,
            skyTexture,
            ...pictures.flatMap((p) => [p.name, p.texture, p.mask]),
          ].filter((name) => name && !lgrAssets.lgr.getSprite(name)),
        ),
      ]
    : [];
  const groundTextureSprite = textureSprites.find(
    ({ texture }) => texture.texture === groundTexture,
  );
  const skyTextureSprite = textureSprites.find(
    ({ texture }) => texture.texture === skyTexture,
  );

  const handleSkyTextureSelect = (nextSky: string) => {
    const previousSky = skyTexture;
    const previousGround = groundTexture;
    if (nextSky === previousSky) return;

    if (nextSky === previousGround) {
      setGround(previousSky);
    }
    setSky(nextSky);
  };

  const handleGroundTextureSelect = (nextGround: string) => {
    const previousSky = skyTexture;
    const previousGround = groundTexture;
    if (nextGround === previousGround) return;

    if (nextGround === previousSky) {
      setSky(previousGround);
    }
    setGround(nextGround);
  };

  const skySrc = skyTextureSprite?.maskedSrc ?? skyTextureSprite?.src;
  const groundSrc = groundTextureSprite?.maskedSrc ?? groundTextureSprite?.src;
  const isLoading = !lgrAssets.isLoaded;
  return (
    <FloatingToolbar open={open} onOpenChange={setOpen}>
      <FloatingToolbarAnchor>
        <Tooltip>
          <TooltipTrigger>
            <FloatingToolbarTrigger>
              <ToolbarButton
                aria-label="Level properties"
                aria-expanded={open}
                isLoading={isLoading}
                disabled={isLoading}
              >
                <LevelTextureIcon skySrc={skySrc} groundSrc={groundSrc} />
              </ToolbarButton>
            </FloatingToolbarTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Level properties</TooltipContent>
        </Tooltip>
      </FloatingToolbarAnchor>
      <FloatingToolbarContent side="bottom" align="center">
        <FloatingToolbarPanel
          orientation="vertical"
          className="min-w-max flex-col items-stretch gap-2 pl-4"
        >
          <TexturePickerRow
            label="Sky"
            selectedTexture={skyTexture}
            textures={allTextures}
            textureSprites={textureSprites}
            onSelect={handleSkyTextureSelect}
            tooltipSide="top"
          />
          <TexturePickerRow
            label="Ground"
            selectedTexture={groundTexture}
            textures={allTextures}
            textureSprites={textureSprites}
            onSelect={handleGroundTextureSelect}
          />
          <div className="flex min-w-max items-center justify-between gap-3 border-t border-separator pt-2">
            <div className="w-12 text-xs font-semibold">LGR</div>
            <LgrSelect
              value={levelLgrName}
              onValueChange={setLgr}
              aria-label="Level LGR"
              className="ml-auto h-8 w-fit min-w-0 text-xs"
            />
          </div>
          {lgrAssets.error ? (
            <p className="max-w-64 pl-15 text-xs text-red-300">
              {lgrAssets.error}
            </p>
          ) : null}
          {lgrAssets.status && (
            <p role="status" className="max-w-72 text-xs text-secondary">
              {lgrAssets.status}
            </p>
          )}
          {missingAssets.length > 0 && (
            <p
              className="max-w-72 text-xs text-secondary"
              title={missingAssets.join(", ")}
            >
              {missingAssets.length} missing{" "}
              {missingAssets.length === 1 ? "asset" : "assets"} in preview.
              References are kept.
            </p>
          )}
        </FloatingToolbarPanel>
      </FloatingToolbarContent>
    </FloatingToolbar>
  );
}

function LevelTextureIcon({
  skySrc,
  groundSrc,
}: {
  skySrc?: string;
  groundSrc?: string;
}) {
  if (!skySrc || !groundSrc) {
    return <span aria-hidden="true" className="h-6 w-6" />;
  }

  return (
    <span className="relative h-6 w-6 overflow-hidden rounded-sm bg-screen">
      <PictureIcon
        className="absolute inset-0 h-full w-full bg-cover bg-center bg-no-repeat"
        src={skySrc}
        style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
      />
      <PictureIcon
        className="absolute inset-0 h-full w-full bg-cover bg-center bg-no-repeat"
        src={groundSrc}
        style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
      />
    </span>
  );
}

type TexturePickerRowProps = {
  label: string;
  selectedTexture: string;
  textures: string[];
  textureSprites: ReturnType<typeof useTextureSprites>;
  onSelect: (texture: string) => void;
  tooltipSide?: "top" | "bottom";
};

function TexturePickerRow({
  label,
  selectedTexture,
  textures,
  textureSprites,
  onSelect,
  tooltipSide = "bottom",
}: TexturePickerRowProps) {
  return (
    <div className="flex min-w-max items-start gap-3">
      <div className="w-12 self-center text-xs font-semibold">{label}</div>
      <div className="flex max-h-48 max-w-80 flex-wrap gap-2 overflow-y-auto">
        {textures.map((textureName) => {
          const textureSprite = textureSprites.find(
            ({ texture }) => texture.texture === textureName,
          );
          const selected = selectedTexture === textureName;
          return (
            <Tooltip key={textureName}>
              <TooltipTrigger>
                <IconButton
                  type="button"
                  aria-label={`${label}: ${textureName}`}
                  onClick={() => onSelect(textureName)}
                  className={cn("overflow-clip p-0 hover:opacity-90", {
                    "border border-accent": selected,
                  })}
                >
                  <PictureIcon
                    className="h-full w-full bg-cover bg-center"
                    src={textureSprite?.maskedSrc ?? textureSprite?.src}
                  />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side={tooltipSide}>{textureName}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
